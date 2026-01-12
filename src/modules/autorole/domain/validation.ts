/**
 * Validation utilities for Autorole domain.
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
