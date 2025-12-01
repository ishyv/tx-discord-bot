/**
 * Parsea una entrada de cantidad "inteligente" (ej: "all", "50%", "100", "max").
 * @param input La entrada del usuario (string).
 * @param total El total disponible (coins en mano o banco).
 * @returns La cantidad numérica parseada (entero positivo). Retorna 0 si es inválido o negativo.
 */
export function parseSmartAmount(input: string, total: number): number {
  if (!input) return 0;

  const lower = input.toLowerCase().trim();
  const available = Number.isFinite(total) ? Math.max(0, total) : 0;

  if (["all", "todo", "max", "maximo", "máximo"].includes(lower)) {
    return Math.floor(available);
  }

  if (lower.endsWith("%")) {
    const percent = Number.parseFloat(lower.slice(0, -1));
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    return Math.floor((available * percent) / 100);
  }

  const numeric = Number.parseFloat(lower);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  return Math.floor(numeric);
}
