/**
 * Motivación: aportar utilidades (validation) para construir la funcionalidad de autoroles sin duplicar parseo ni validación.
 *
 * Idea/concepto: define tipos, caché y validadores que consumen los sistemas y comandos de autorole.
 *
 * Alcance: piezas de infraestructura; no programan las reglas de asignación en sí mismas.
 */
const RULE_SLUG_PATTERN = /^[a-z0-9-]{1,40}$/;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export function isValidRuleSlug(slug: string): boolean {
  if (typeof slug !== "string") return false;
  const trimmed = slug.trim();
  if (!trimmed) return false;
  return RULE_SLUG_PATTERN.test(trimmed);
}

export function normalizeRuleSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function normalizeSnowflake(
  input: string | number | bigint | null | undefined,
): string {
  if (input == null) return "";
  const str = String(input).trim();
  if (!SNOWFLAKE_PATTERN.test(str)) return "";
  return str;
}

export function isValidThresholdCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 1000;
}
