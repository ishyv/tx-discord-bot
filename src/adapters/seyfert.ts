/**
 * Seyfert API Adapter Layer.
 *
 * Purpose: Normalize Seyfert API usage and handle property naming conventions.
 * This adapter provides typed helpers for:
 * - Component creation with correct property names (custom_id vs customId)
 * - Context parsing (guildId, userId, options)
 * - Reply/editReply patterns with ephemeral handling
 */

import type {
  GuildCommandContext,
  StringSelectMenu as StringSelectMenuType,
  Button as ButtonType,
  ActionRow as ActionRowType,
} from "seyfert";
import { StringSelectMenu, Button, ActionRow } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";

// =============================================================================
// Types
// =============================================================================

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: { name: string };
  default?: boolean;
}

export interface SelectMenuConfig {
  custom_id: string;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  min_values?: number;
  max_values?: number;
}

export interface ButtonConfig {
  custom_id: string;
  label?: string;
  style: number;
  emoji?: { name: string };
  disabled?: boolean;
}

export interface ReplyOptions {
  content?: string;
  embeds?: any[];
  components?: any[];
  ephemeral?: boolean;
}

// =============================================================================
// Component Factory Functions
// =============================================================================

/**
 * Create a StringSelectMenu with correct property naming.
 * Normalizes customId -> custom_id for API compatibility.
 */
export function createSelectMenu(config: {
  customId: string;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  minValues?: number;
  maxValues?: number;
}): StringSelectMenuType {
  return new StringSelectMenu({
    custom_id: config.customId,
    placeholder: config.placeholder,
    options: config.options,
    disabled: config.disabled,
    min_values: config.minValues,
    max_values: config.maxValues,
  } as any);
}

/**
 * Create a Button with correct property naming.
 * Normalizes customId -> custom_id for API compatibility.
 */
export function createButton(config: {
  customId: string;
  label?: string;
  style: number;
  emoji?: { name: string };
  disabled?: boolean;
}): ButtonType {
  return new Button({
    custom_id: config.customId,
    label: config.label,
    style: config.style,
    emoji: config.emoji,
    disabled: config.disabled,
  } as any);
}

/**
 * Create an ActionRow with Button components.
 */
export function createButtonRow(
  ...components: ButtonType[]
): ActionRowType<ButtonType> {
  return new ActionRow<ButtonType>().addComponents(...components);
}

/**
 * Create an ActionRow with StringSelectMenu components.
 */
export function createSelectMenuRow(
  ...components: StringSelectMenuType[]
): ActionRowType<StringSelectMenuType> {
  return new ActionRow<StringSelectMenuType>().addComponents(...components);
}

// =============================================================================
// Context Helpers
// =============================================================================

/**
 * Extract common fields from GuildCommandContext.
 */
export function getContextInfo(ctx: GuildCommandContext) {
  return {
    guildId: ctx.guildId,
    userId: ctx.author.id,
    username: ctx.author.username,
    avatarURL: ctx.author.avatarURL(),
  };
}

/**
 * Get string value from select menu interaction.
 * Uses type-safe access for component values.
 */
export function getSelectValue(ctx: GuildCommandContext): string | undefined {
  // @ts-ignore - component values are dynamic
  return ctx.values?.[0] as string | undefined;
}

/**
 * Get multiple string values from select menu interaction.
 */
export function getSelectValues(ctx: GuildCommandContext): string[] {
  // @ts-ignore - component values are dynamic
  return (ctx.values as string[]) ?? [];
}

// =============================================================================
// Reply Helpers
// =============================================================================

/**
 * Send an ephemeral reply to the context.
 */
export async function replyEphemeral(
  ctx: GuildCommandContext,
  options: { content?: string; embeds?: any[]; components?: any[] },
) {
  return ctx.editOrReply({
    ...options,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Send or edit a reply with proper ephemeral handling.
 */
export async function replyOrEdit(
  ctx: GuildCommandContext,
  options: {
    content?: string;
    embeds?: any[];
    components?: any[];
    ephemeral?: boolean;
  },
) {
  const flags = options.ephemeral ? MessageFlags.Ephemeral : undefined;
  return ctx.editOrReply({
    content: options.content,
    embeds: options.embeds,
    components: options.components,
    flags,
  });
}

// =============================================================================
// Option Parsing Helpers
// =============================================================================

/**
 * Safely parse string option from command context.
 */
export function parseStringOption<T extends string>(
  ctx: GuildCommandContext<any>,
  key: string,
): T | undefined {
  const value = ctx.options?.[key];
  return typeof value === "string" ? (value as T) : undefined;
}

/**
 * Safely parse number option from command context.
 */
export function parseNumberOption(
  ctx: GuildCommandContext<any>,
  key: string,
): number | undefined {
  const value = ctx.options?.[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * Safely parse boolean option from command context.
 */
export function parseBooleanOption(
  ctx: GuildCommandContext<any>,
  key: string,
): boolean | undefined {
  const value = ctx.options?.[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Safely parse user option from command context.
 */
export function parseUserOption(
  ctx: GuildCommandContext<any>,
  key: string,
): { id: string; username: string } | undefined {
  const value = ctx.options?.[key];
  if (value && typeof value === "object" && "id" in value) {
    return {
      id: (value as any).id as string,
      username: ((value as any).username ??
        (value as any).name ??
        "Unknown") as string,
    };
  }
  return undefined;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check if the context has a valid guild.
 */
export function hasGuild(
  ctx: GuildCommandContext,
): ctx is GuildCommandContext & { guildId: string } {
  return typeof ctx.guildId === "string" && ctx.guildId.length > 0;
}

/**
 * Require guild or return error response.
 */
export async function requireGuild<T>(
  ctx: GuildCommandContext,
  callback: (guildId: string) => Promise<T>,
): Promise<T | void> {
  if (!hasGuild(ctx)) {
    await replyEphemeral(ctx, {
      content: "This command can only be used in a server.",
    });
    return;
  }
  return callback(ctx.guildId);
}

// =============================================================================
// Re-export for convenience
// =============================================================================

export { MessageFlags };
export type { GuildCommandContext };
