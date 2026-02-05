/**
 * HP Bar Renderer.
 *
 * Purpose: Visual HP bar generation for combat displays.
 * Context: Discord embeds with progress bar styling.
 */

/** HP bar options. */
export interface HpBarOptions {
  /** Current HP. */
  current: number;
  /** Maximum HP. */
  max: number;
  /** Bar length in characters. */
  length?: number;
  /** Filled character. */
  fillChar?: string;
  /** Empty character. */
  emptyChar?: string;
  /** Show percentage. */
  showPercent?: boolean;
}

/** HP bar colors based on percentage. */
export function getHpColor(percent: number): string {
  if (percent > 70) return "🟩"; // Green
  if (percent > 30) return "🟨"; // Yellow
  return "🟥"; // Red
}

/** Render HP bar string. */
export function renderHpBar(options: HpBarOptions): string {
  const {
    current,
    max,
    length = 10,
    fillChar = "█",
    emptyChar = "░",
    showPercent = true,
  } = options;

  const clampedCurrent = Math.max(0, Math.min(max, current));
  const percent = max > 0 ? (clampedCurrent / max) * 100 : 0;
  const filledLength = Math.round((percent / 100) * length);
  const emptyLength = length - filledLength;

  const bar = fillChar.repeat(filledLength) + emptyChar.repeat(emptyLength);
  const color = getHpColor(percent);

  if (showPercent) {
    return `${color} \`${bar}\` ${Math.round(percent)}% (${clampedCurrent}/${max})`;
  }

  return `${color} \`${bar}\``;
}

/** Compact HP bar for inline use. */
export function renderCompactHpBar(current: number, max: number): string {
  const percent = max > 0 ? (current / max) * 100 : 0;
  const color = getHpColor(percent);
  return `${color} **${current}**/${max} HP`;
}

/** HP Bar Renderer namespace. */
export const HpBarRenderer = {
  render: renderHpBar,
  compact: renderCompactHpBar,
  getColor: getHpColor,
} as const;
