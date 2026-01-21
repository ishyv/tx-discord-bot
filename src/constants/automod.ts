/**
 * Motivación: centralizar constantes de automod para evitar valores mágicos dispersos en el código.
 *
 * Idea/concepto: agrupa configuraciones estáticas en un módulo sin estado para facilitar su reutilización y versionado.
 *
 * Alcance: expone valores consumidos por otros módulos; no contiene lógica ni efectos secundarios.
 */
/**
 * Constantes de AutoMod: Patrones de detección de spam y estafas.
 *
 * Propósito: Centralizar todas las reglas de detección de contenido malicioso
 * para mantener consistencia y facilitar mantenimiento del sistema AutoMod.
 *
 * Encaje en el sistema: Consumido por AutoModSystem para aplicar filtros
 * de texto y links. Es la única fuente de verdad de patrones de detección.
 *
 * Invariantes clave:
 *   - spamFilterList: Filtros con acciones (mute, advertencia)
 *   - scamFilterList: Solo patrones regex (sin acciones asociadas)
 *   - Todos los filtros son case-insensitive y usan word boundaries
 *
 * Tradeoffs y decisiones:
 *   - Alta sensibilidad: Preferir falsos positivos sobre falsos negativos
 *   - Patrones literales: Más predecibles pero más fáciles de evadir
 *   - Separación de responsabilidades: Spam vs Scam tienen tratamientos diferentes
 *
 * Riesgos conocidos:
 *   - Falsos positivos en comunidades legítimas (crypto, gaming)
 *   - Patrones pueden ser evadidos con obfuscación simple
 *   - Mantenimiento manual requerido para nuevas tácticas de spam
 *
 * Gotchas:
 *   - Los patrones usan tolerancia a separación de caracteres ([\s\W_]*)
 *   - $number token maneja formatos numéricos comunes
 *   - El orden de los filtros importa (se detiene en el primer match)
 */
interface IFilter {
  filter: RegExp;
  mute: boolean;
  warnMessage?: string;
}

const LINK_SOSPECHOSO = "🚫 Enlace sospechoso.";
const SPAM_BOT = "🚫 Spam bot.";

/**
 * Filtros de spam con acciones asociadas (timeout, advertencias).
 *
 * Categorías principales:
 *   - Dominios sospechosos (.xyz, .click, .info, .ru, .biz, .online, .club)
 *   - Enlaces directos a mensajería (t.me, wa.me)
 *   - Contenido para adultos
 *   - Invites de Discord (con excepción de servidores oficiales)
 *   - Estafas de gaming/gambling
 *   - Promociones engañosas (crypto, nitro gratis)
 *
 * Comportamiento:
 *   - mute=true: Aplica timeout de 5 minutos al usuario
 *   - mute=false: Solo envía advertencia al staff
 *   - warnMessage: Mensaje personalizado para notificación
 *
 * RISK: Alta sensibilidad puede generar falsos positivos en
 *   comunidades legítimas que usan estos dominios o temas.
 *
 * TODO: Considerar configuración por guild para sensibilidad
 *   y excepciones específicas por comunidad.
 */
export const spamFilterList: IFilter[] = [
  {
    filter: /https?:\/\/[\w.-]+\.xyz($|\W)/i,
    mute: false,
    warnMessage: LINK_SOSPECHOSO,
  },
  {
    filter: /https?:\/\/[\w.-]+\.click($|\W)/i,
    mute: false,
    warnMessage: LINK_SOSPECHOSO,
  },
  {
    filter: /https?:\/\/[\w.-]+\.info($|\W)/i,
    mute: false,
    warnMessage: LINK_SOSPECHOSO,
  },
  {
    filter: /https?:\/\/[\w.-]+\.ru($|\W)/i,
    mute: false,
    warnMessage: LINK_SOSPECHOSO,
  },
  {
    filter: /https?:\/\/[\w.-]+\.biz($|\W)/i,
    mute: false,
    warnMessage: LINK_SOSPECHOSO,
  },
  {
    filter: /https?:\/\/[\w.-]+\.online($|\W)/i,
    mute: false,
    warnMessage: LINK_SOSPECHOSO,
  },
  {
    filter: /https?:\/\/[\w.-]+\.club($|\W)/i,
    mute: false,
    warnMessage: LINK_SOSPECHOSO,
  },
  {
    filter: /(https?:\/\/)?(t\.me|telegram\.me|wa\.me|whatsapp\.me)\/.+/i,
    mute: true,
  },
  {
    filter: /(https?:\/\/)?(pornhub|xvideos|xhamster|xnxx|hentaila)(\.\S+)+\//i,
    mute: true,
  },
  {
    filter:
      /(?!(https?:\/\/)?discord\.gg\/programacion$)(https?:\/\/)?discord\.gg\/\w+/i,
    mute: false,
  },
  {
    filter:
      /(?!(https?:\/\/)?discord\.com\/invite\/programacion$)(https?:\/\/)?discord\.com\/invite\/.+/i,
    mute: true,
  },
  {
    filter: /(https?:\/\/)?multiigims.netlify.app/i,
    mute: true,
  },
  { filter: /\[.*?steamcommunity\.com\/.*\]/i, mute: true },
  {
    filter: /https?:\/\/(www\.)?\w*solara\w*\.\w+\/?/i,
    mute: true,
    warnMessage: SPAM_BOT,
  },
  {
    filter: /(?:solara|wix)(?=.*\broblox\b)(?=.*(?:executor|free)).*/is,
    mute: true,
    warnMessage: SPAM_BOT,
  },
  {
    filter: /(?:https?:\/\/(?:www\.)?|www\.)?outlier\.ai\b/gi,
    mute: true,
    warnMessage: SPAM_BOT,
  },
  {
    filter:
      /(?=.*\b(eth|ethereum|btc|bitcoin|capital|crypto|memecoins|nitro|\$|nsfw)\b)(?=.*\b(gana\w*|gratis|multiplica\w*|inver\w*|giveaway|server|free|earn)\b)/is,
    mute: false,
    warnMessage: "Posible estafa detectada",
  },
];

/**
 * Convierte una frase sencilla en una RegExp robusta para detectar spam.
 *
 * Reglas:
 * - Tolerancia entre letras: permite espacios, puntuación o underscores entre CADA carácter
 *   de cada palabra literal (ej: "free bonus" casa "f.r_e e  bo-nus").
 * - Los espacios de la frase se tratan como separadores permisivos.
 * - Se añaden límites de palabra (\b) a ambos extremos para reducir falsos positivos.
 *
 * ### Tokens
 * - $number: número con formato común, opcionalmente precedido por $ y/o seguido de k/m/b.
 *    Ejemplos válidos: "$100", "1,000", "2.5k", "3.000,50", "$ 1 000", "5000b".
 *
 * Ejemplos:
 *   phraseToSpamRegex("free bonus code")
 *   phraseToSpamRegex("receive your $number")
 */
/**
 * Convierte una frase simple en regex robusta para detección de spam.
 *
 * Propósito: Transformar frases de scam en patrones regex tolerantes
 * a obfuscación y variaciones de formato usadas por spammers.
 *
 * Estrategia de tolerancia (crítica para efectividad):
 *   - Separación flexible: Permite cualquier separador entre caracteres
 *   - Tokens numéricos: $number maneja múltiples formatos monetarios
 *   - Word boundaries: Evita match dentro de palabras legítimas
 *   - Case-insensitive: Ignora mayúsculas/minúsculas
 *
 * Ejemplos de transformación:
 *   "free bonus" → "f[\s\W_]*r[\s\W_]*e[\s\W_]*e[\s\W_]* [\s\W_]*b[\s\W_]*o[\s\W_]*n[\s\W_]*u[\s\W_]*s[\s\W_]*"
 *   "get $number" → "g[\s\W_]*e[\s\W_]*t[\s\W_]* [\s\W_]*\$?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*[kKmMbB])?"
 *
 * @param phrase Frase simple a convertir
 * @returns RegExp con tolerancia a obfuscación
 *
 * Invariantes:
 *   - Siempre incluye word boundaries (\b) al inicio y fin
 *   - Siempre es case-insensitive (flag 'i')
 *   - Los espacios se convierten en separadores flexibles
 *
 * RISK: Alta tolerancia puede generar falsos positivos
 *   en conversaciones legítimas que usan palabras similares.
 *
 * Performance: Patrones complejos pueden ser más lentos
 *   pero necesarios para detectar spam evasivo.
 */
export function phraseToSpamRegex(phrase: string): RegExp {
  const SEP = String.raw`[\s\W_]*`;
  const NUMBER = String.raw`\$?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s*[kKmMbB])?`;

  // Particiona por token $number (case-insensitive), espacios o literales.
  const parts = phrase.match(/(\$number)|\s+|[^\s]+/gi) ?? [];

  const body = parts
    .map(seg => {
      const s = seg.toString();
      if (/^\s+$/.test(s)) return SEP;                  // espacios → separador permisivo
      if (/^\$number$/i.test(s)) return NUMBER;         // token → patrón numérico
      // literal → permitir "basura" entre cada carácter
      return s
        .split("")
        .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(SEP);
    })
    .join("");

  // Límites de palabra alrededor del cuerpo; flag 'i' para case-insensitive.
  return new RegExp(`\\b(?:${body})\\b`, "i");
}

/* Genera permutaciones de las "palabras" en la cadena dada.
 * Ejemplo: "a b c" -> ["a b c", "a c b", "b a c", "b c a", "c a b", "c b a"]
 * - Separa por espacios (cualquier cantidad).
 * - Maneja palabras repetidas sin duplicar resultados.
 */
/**
 * Genera permutaciones de palabras para detectar scams independientemente del orden.
 *
 * Propósito: Aumentar cobertura de detección permitiendo que las palabras
 * clave aparezcan en cualquier orden dentro de la frase de scam.
 *
 * Ejemplo: "free nitro code" → [
 *   "free nitro code",
 *   "free code nitro", 
 *   "nitro free code",
 *   "nitro code free",
 *   "code free nitro",
 *   "code nitro free"
 * ]
 *
 * @param s Frase con palabras separadas por espacios
 * @returns Array con todas las permutaciones únicas
 *
 * Invariantes:
 *   - Siempre retorna array no vacío si input tiene palabras
 *   - Elimina duplicados automáticamente
 *   - Maneja palabras repetidas sin duplicar resultados
 *
 * Performance: O(n!) para n palabras - usar con frases cortas (3-4 palabras)
 *
 * RISK: Explosión combinatoria con frases largas.
 *   Limitado a frases cortas por esta razón.
 */
function wordPermutations(s: string): string[] {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0]];

  // Ordena para poder saltar duplicados de forma estable
  const arr = [...words].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  const used = new Array(arr.length).fill(false);
  const result: string[] = [];
  const path: string[] = [];

  function backtrack() {
    if (path.length === arr.length) {
      result.push(path.join(" "));
      return;
    }
    let prev: string | undefined;
    for (let i = 0; i < arr.length; i++) {
      if (used[i]) continue;
      // Evita duplicados en el mismo nivel
      if (prev !== undefined && arr[i] === prev) continue;

      used[i] = true;
      path.push(arr[i]);
      backtrack();
      path.pop();
      used[i] = false;

      prev = arr[i];
    }
  }

  backtrack();
  return result;
}

// Canonical phrases (order-agnostic via permutations)
const BASE_PHRASES = [
  "free bonus code",
  "crypto casino",
  "receive your $number",
  "belowex",
  "evencas",
  "special promo code",
  "bonus instantly",
  "deleted one hour",
  "claim your reward",
  "free gift code",
  "take your free reward",
  "free nitro",
  "free nitro click here",
  "free discord nitro",   
  "claim your nitro",
] as const;

// Expand with permutations, dedupe, and compile
const PHRASES: string[] = Array.from(
  new Set(
    (BASE_PHRASES as readonly string[]).flatMap(wordPermutations)
  )
);

// ! Muy sensible a falsos positivos ! 
// NOTA: Esta advertencia del código original es CRÍTICA.
// Los patrones generados son intencionalmente agresivos para maximizar
// detección de scams, pero esto genera falsos positivos en
// comunidades legítimas (crypto, gaming, promociones reales).
//
// Tradeoff: Preferir falsos positivos sobre falsos negativos.
// Impacto: Staff recibe notificaciones que deben descartar manualmente.
// Solución futura: Considerar scoring o contexto para reducir sensibilidad.
export const scamFilterList: RegExp[] = PHRASES.map(phraseToSpamRegex);