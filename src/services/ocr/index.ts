/**
 * Motivación: exponer un punto único de entrada para OCR en el bot sin acoplarse a la implementación concreta.
 *
 * Idea/concepto: reexporta funciones del proveedor activo (PaddleOCR) y mantiene la API de reconocimiento estable.
 *
 * Alcance: sirve como fachada de OCR; no contiene la lógica de preprocesamiento ni la carga de modelos.
 */
export { recognizeText } from "./paddle";
