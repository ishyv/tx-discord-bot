/**
 * Parsea una entrada de cantidad "inteligente" (ej: "all", "50%", "100", "max").
 * @param input La entrada del usuario (string).
 * @param total El total disponible (coins en mano o banco).
 * @returns La cantidad numérica parseada (entero). Retorna 0 si es inválido o negativo.
 */
export function parseSmartAmount(input: string, total: number): number {
    if (!input) return 0;
    const lower = input.toLowerCase().trim();

    // Palabras clave para todo el monto
    if (["all", "todo", "max", "maximo", "máximo"].includes(lower)) {
        return Math.max(0, Math.floor(total));
    }

    // Porcentajes (ej: "50%", "10%")
    if (lower.endsWith("%")) {
        const percent = Number.parseFloat(lower.slice(0, -1));
        if (Number.isNaN(percent) || percent <= 0) return 0;
        // Clamp percentage between 0 and 100? Usually implied by logic, but let's be safe.
        // If user says 200%, it tries to give 2x total. Logic downstream might fail if funds insufficient,
        // but here we just calculate the amount requested.
        // However, usually "50%" of balance implies a portion of available funds.
        return Math.max(0, Math.floor((total * percent) / 100));
    }

    // Número directo
    const num = Number.parseFloat(lower);
    if (Number.isNaN(num) || num <= 0) return 0;

    return Math.floor(num);
}
