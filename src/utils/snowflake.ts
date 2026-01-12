const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export const isSnowflake = (value: unknown): value is string => {
  return typeof value === "string" && SNOWFLAKE_PATTERN.test(value);
};

export const normalizeSnowflake = (value: unknown): string | null => {
  if (value == null) return null;
  const str = String(value).trim();
  if (!SNOWFLAKE_PATTERN.test(str)) return null;
  return str;
};
