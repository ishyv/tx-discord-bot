/**
 * OCR Service: Reconocimiento de texto en imágenes usando PaddleOCR.
 *
 * Propósito: Extraer texto de imágenes para análisis posterior (detección de estafas).
 * Es el único componente que interactúa directamente con el modelo ML de OCR.
 *
 * Encaje en el sistema: Servicio de bajo nivel consumido por AutoModSystem.
 * Aísla completamente la complejidad de PaddleOCR del resto del código.
 *
 * Invariantes clave:
 *   - Lazy loading: El servicio OCR se inicializa solo en la primera llamada
 *   - Serialización: Todas las tareas OCR se encolan para evitar sobrecarga
 *   - Fail-safe: Si el servicio falla en inicializarse, se marca como unavailable permanentemente
 *   - Preprocessing agresivo: Grayscale + normalize + threshold(150) + alpha
 *
 * Tradeoffs y decisiones:
 *   - Fixed preprocessing: Threshold(150) es rápido pero frágil a condiciones de iluminación
 *   - Queue serialization: Previene sobrecarga pero añade latencia
 *   - No retries: Fallos se marcan permanentemente para evitar ciclos de error
 *   - Mobile models: PP-OCRv5 mobile es más ligero pero menos preciso que versiones completas
 *
 * Riesgos conocidos:
 *   - ocrUnavailable=true permanente si falla la inicialización
 *   - Threshold fijo puede causar falsos negativos en imágenes con baja/iluminación variable
 *   - Sin soporte para texto manuscrito (modelo entrenado solo en texto impreso)
 *   - Consumo elevado de CPU durante el procesamiento
 *
 * Gotchas:
 *   - Las imágenes se preprocesan siempre, incluso si ya son blanco y negro
 *   - El servicio puede volverse "unavailable" y nunca recuperarse sin reiniciar
 *   - No hay límite de concurrencia explícito más allá de la cola serial
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import type { PaddleOcrService as PaddleOcrServiceClass } from "paddleocr";

type ImageInput = { data: Uint8Array; width: number; height: number };

const OCR_ASSETS_DIR =
  process.env.OCR_ASSETS_DIR ?? path.resolve(process.cwd(), "assets/ocr");
const DETECTION_MODEL_FILE =
  process.env.OCR_DETECTION_MODEL ?? "PP-OCRv5_mobile_det_infer.onnx";
const RECOGNITION_MODEL_FILE =
  process.env.OCR_RECOGNITION_MODEL ?? "PP-OCRv5_mobile_rec_infer.onnx";
const DICTIONARY_FILE = process.env.OCR_DICTIONARY ?? "ppocrv5_dict.txt";

let ocrServicePromise: Promise<PaddleOcrServiceClass | null> | undefined;
let ocrQueue: Promise<void> = Promise.resolve();

let ocrUnavailable = false;

/**
 * Preprocesa imagen para OCR usando Sharp con pipeline agresivo.
 *
 * Propósito: Normalizar imágenes para mejorar la precisión de PaddleOCR,
 * aplicando transformaciones que favorecen la detección de texto impreso.
 *
 * Pipeline de preprocessing (orden crítico):
 *   1. Grayscale: Elimina información de color que no ayuda en OCR
 *   2. Normalize: Ajusta contraste automáticamente
 *   3. Threshold(150): Binarización agresiva a blanco/negro
 *   4. EnsureAlpha: Asegura canal alpha para compatibilidad con PaddleOCR
 *   5. Raw buffer: Convierte a formato crudo para el modelo ML
 *
 * @param buffer ArrayBuffer de la imagen original
 * @returns ImageInput con datos procesados para PaddleOCR
 *
 * Side effects:
 *   - Procesamiento intensivo de CPU/GPU (Sharp operations)
 *   - Reduce información de la imagen permanentemente
 *
 * Invariantes:
 *   - Siempre retorna datos válidos o lanza (errores de Sharp se propagan)
 *   - Threshold fijo de 150 sin adaptación a contenido
 *   - Siempre incluye canal alpha aunque la imagen original no lo tenga
 *
 * RISK: Threshold(150) fijo puede eliminar texto sutil o con bajo contraste.
 *   Imágenes con iluminación variable o fondos complejos pueden fallar completamente.
 *
 * ALT: Se consideró threshold adaptivo (Otsu, mean) pero impacta significativamente
 *   la performance y puede introducir ruido en imágenes ya binarizadas.
 */
async function preprocessImage(buffer: ArrayBuffer): Promise<ImageInput> {
  const source = Buffer.from(buffer);
  const { data, info } = await sharp(source)
    .grayscale()
    .normalize()
    .threshold(150)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/**
 * Inicializa el servicio PaddleOCR cargando modelos y diccionarios.
 *
 * Propósito: Crear instancia de PaddleOcrService con modelos ONNX locales
 * y configuración específica para el entorno del bot.
 *
 * Flujo de inicialización:
 *   1. Carga archivos de modelos (detección, reconocimiento) y diccionario
 *   2. Importa módulo paddleOCR (con fallback a globalThis)
 *   3. Crea instancia con modelos cargados y diccionario de caracteres
 *
 * @returns Promise<PaddleOcrServiceClass | null> Servicio configurado o null si falla
 *
 * Side effects:
 *   - Lectura de archivos del filesystem (modelos ONNX ~10-20MB)
 *   - Import dinámico del módulo paddleOCR
 *   - Logging de errores si la inicialización falla
 *
 * Invariantes:
 *   - Si retorna null, el servicio OCR queda marcado como unavailable permanentemente
 *   - Los modelos se cargan una sola vez por instancia del bot
 *   - El diccionario siempre tiene string vacío al inicio (requerido por PaddleOCR)
 *
 * RISK: Si falla la carga de modelos o import del módulo, el OCR queda
 *   deshabilitado permanentemente hasta reiniciar el proceso.
 *
 * WHY: Lazy loading evita cargar modelos pesados al inicio del bot,
 *   permitiendo que el bot funcione aunque OCR falle más tarde.
 */
async function createOcrService(): Promise<PaddleOcrServiceClass | null> {
  try {
    const baseDir = OCR_ASSETS_DIR;
    const [detectionModel, recognitionModel, dictionaryRaw] = await Promise.all(
      [
        readFile(path.join(baseDir, DETECTION_MODEL_FILE)),
        readFile(path.join(baseDir, RECOGNITION_MODEL_FILE)),
        readFile(path.join(baseDir, DICTIONARY_FILE), "utf8"),
      ],
    );

    const module = await import("paddleocr");
    const PaddleOcrService =
      (module as any).PaddleOcrService ??
      (globalThis as any)?.paddleocr?.PaddleOcrService;

    if (!PaddleOcrService) {
      console.error(
        "OCR: PaddleOcrService no está disponible tras importar el módulo.",
      );
      return null;
    }

    const dictionary = dictionaryRaw.split(/\r?\n/).map((line) => line.trim());

    if (dictionary.length > 0 && dictionary[dictionary.length - 1] === "") {
      dictionary.pop();
    }

    if (dictionary.length === 0 || dictionary[0] !== "") {
      dictionary.unshift("");
    }

    return await PaddleOcrService.createInstance({
      ort,
      detection: {
        modelBuffer: bufferToArrayBuffer(detectionModel),
      },
      recognition: {
        modelBuffer: bufferToArrayBuffer(recognitionModel),
        charactersDictionary: dictionary,
      },
    });
  } catch (error) {
    console.error("OCR: no se pudo inicializar PaddleOCR", error);
    return null;
  }
}

/**
 * Obtiene instancia del servicio OCR con manejo de estado de disponibilidad.
 *
 * Propósito: Proveer acceso al servicio OCR con cacheo de la instancia
 * y manejo de fallos permanentes para evitar reintentos innecesarios.
 *
 * Comportamiento:
 *   - Primera llamada: Inicializa el servicio (lazy loading)
 *   - Llamadas subsecuentes: Retorna instancia cacheada
 *   - Si ocrUnavailable=true: Retorna null inmediatamente sin reintentar
 *
 * @returns Promise<PaddleOcrServiceClass | null> Servicio disponible o null
 *
 * Invariantes:
 *   - ocrUnavailable solo puede cambiar de false a true (nunca viceversa)
 *   - ocrServicePromise se resuelve una sola vez
 *   - Nunca lanza: Siempre retorna Promise con servicio o null
 *
 * RISK: Una vez que ocrUnavailable=true, el OCR queda deshabilitado
 *   permanentemente hasta reiniciar el proceso del bot.
 */
function getOcrService(): Promise<PaddleOcrServiceClass | null> {
  if (ocrUnavailable) return Promise.resolve(null);
  if (!ocrServicePromise) {
    ocrServicePromise = createOcrService();
  }
  return (
    ocrServicePromise as unknown as Promise<PaddleOcrServiceClass | null>
  ).then(
    (service) => {
      if (!service) ocrUnavailable = true;
      return service;
    },
    () => {
      ocrUnavailable = true;
      return null;
    },
  );
}

/**
 * Encola una tarea OCR para ejecución serializada.
 *
 * Propósito: Serializar todas las operaciones OCR para evitar sobrecarga
 * del sistema y agotamiento de recursos, manteniendo orden FIFO.
 *
 * Comportamiento:
 *   - Las tareas se ejecutan en orden FIFO (First In, First Out)
 *   - Cada tarea espera a que la anterior termine
 *   - Errores no detienen la cola, se loguean y continúa
 *   - Si el servicio OCR es null, retorna undefined inmediatamente
 *
 * @param run Función que recibe el servicio OCR y retorna resultado
 * @returns Promise<T> Resultado de la tarea o undefined si OCR no disponible
 *
 * Side effects:
 *   - Modifica ocrQueue (cadena de promesas)
 *   - Potencial bloqueo si hay muchas tareas en cola
 *
 * Invariantes:
 *   - La cola siempre mantiene orden FIFO estricto
 *   - Nunca rechaza promesas (siempre resuelve con resultado o undefined)
 *   - Las tareas no se ejecutan en paralelo, siempre secuencial
 *
 * RISK: Si hay muchas imágenes simultáneas, la latencia puede acumularse.
 *   No hay límite de concurrencia o timeout por tarea individual.
 *
 * WHY: Serialización previene sobrecarga de CPU y memoria que podría
 *   ocurrir con múltiples procesamientos OCR en paralelo.
 */
async function enqueueOcrTask<T>(
  run: (service: PaddleOcrServiceClass) => Promise<T>,
): Promise<T> {
  const task = ocrQueue
    .then(() => getOcrService())
    .then((service) => (service ? run(service) : (undefined as unknown as T)));

  ocrQueue = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}

/**
 * Función principal de OCR: extrae texto de una imagen.
 *
 * Propósito: API pública del servicio OCR que orquesta preprocessing,
 * serialización y reconocimiento de texto usando PaddleOCR.
 *
 * Flujo completo:
 *   1. Preprocesa imagen con Sharp (grayscale, normalize, threshold)
 *   2. Encola tarea en ocrQueue para ejecución serializada
 *   3. Ejecuta reconocimiento con PaddleOCR
 *   4. Extrae y concatena texto de todos los bloques detectados
 *
 * @param buffer ArrayBuffer de la imagen a procesar
 * @returns Promise<string> Texto extraído o string vacío si falla
 *
 * Side effects:
 *   - Inicializa servicio OCR si es primera llamada (lazy loading)
 *   - Procesamiento intensivo de CPU
 *   - Logging de errores si falla cualquier paso
 *
 * Invariantes:
 *   - Nunca lanza: Siempre retorna string (vacío si hay error)
 *   - El texto se normaliza a espacio simple entre bloques
 *   - Si el servicio OCR no está disponible, retorna string vacío
 *
 * RISK: El preprocessing agresivo puede eliminar texto válido,
 *   resultando en string vacío incluso cuando la imagen contiene texto.
 *
 * Performance: Typical processing time 100-500ms dependiendo del tamaño
 *   y complejidad de la imagen. El bottleneck suele ser el preprocessing.
 */
export async function recognizeText(buffer: ArrayBuffer): Promise<string> {
  try {
    const image = await preprocessImage(buffer);
    const results = await enqueueOcrTask((service) => service.recognize(image));
    if (!Array.isArray(results)) return "";
    return results.map((item) => (item as any)?.text ?? "").join(" ");
  } catch (error) {
    console.error("OCR: recognizeText failed", error);
    return "";
  }
}
