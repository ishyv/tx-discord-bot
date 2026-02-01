export const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      ),
    ),
  );
};

export const normalizeWarns = <T extends Record<string, unknown>>(
  value: unknown,
): T[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "object" && entry ? ({ ...entry } as T) : null,
    )
    .filter((entry): entry is T => !!entry);
};

export const normalizeNumberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const entries =
    value instanceof Map
      ? Array.from(value.entries())
      : Object.entries(value as Record<string, unknown>);

  const acc: Record<string, number> = {};
  for (const [key, raw] of entries) {
    const num = Number(raw);
    if (Number.isFinite(num)) {
      acc[key] = num;
    }
  }
  return acc;
};

export const asDate = (
  value: unknown,
  fallback: Date | null = null,
): Date | null => {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

export const normalizeId = (value: unknown): string | null => {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
};
