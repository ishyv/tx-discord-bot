/**
 * Economy Permission Utilities.
 *
 * Purpose: Centralized permission checking for economy operations.
 * Encaje: Used by commands and services to validate actor permissions.
 *
 * Philosophy:
 * - Single source of truth for "who can do what" in economy
 * - Commands check at entrypoint, services validate at boundary
 * - No command picks its own permission philosophy
 */

import type { InteractionGuildMember } from "seyfert";
import { memberHasDiscordPermission } from "@/utils/commandGuards";
import type { UserId } from "@/db/types";

/** Permission levels for economy operations. */
export enum EconomyPermissionLevel {
  ADMIN = "admin",
  MOD = "mod",
  USER = "user",
}

/** Default permission required for mod-only operations. */
export const DEFAULT_MOD_PERMISSION = ["ManageGuild"];

/** Default permission required for admin operations. */
export const DEFAULT_ADMIN_PERMISSION = ["Administrator"];

/**
 * Check if a member has the required permission level for economy operations.
 *
 * @param member The guild member to check
 * @param requiredLevel The minimum permission level required
 * @returns true if the member has the required permission
 */
export async function checkEconomyPermission(
  member: InteractionGuildMember | null | undefined,
  requiredLevel: EconomyPermissionLevel,
): Promise<boolean> {
  if (!member) return false;

  switch (requiredLevel) {
    case "admin":
      return memberHasDiscordPermission(member, DEFAULT_ADMIN_PERMISSION);
    case "mod":
      // Mods need ManageGuild or admin
      const hasAdmin = await memberHasDiscordPermission(
        member,
        DEFAULT_ADMIN_PERMISSION,
      );
      if (hasAdmin) return true;
      return memberHasDiscordPermission(member, DEFAULT_MOD_PERMISSION);
    case "user":
      // All users can use their own economy
      return true;
    default:
      return false;
  }
}

/**
 * Create a permission checker function for use in service layer.
 * This binds the member/permission check for later use.
 *
 * @param member The guild member performing the action
 * @param requiredLevel The minimum permission level required
 * @returns A function that returns Promise<boolean>
 *
 * @example
 * const checkAdmin = createPermissionChecker(ctx.member, "admin");
 * const result = await currencyMutationService.adjustCurrencyBalance(input, checkAdmin);
 */
export function createPermissionChecker(
  member: InteractionGuildMember | null | undefined,
  requiredLevel: EconomyPermissionLevel,
): () => Promise<boolean> {
  return async () => checkEconomyPermission(member, requiredLevel);
}

/**
 * Check permissions for a specific economy operation type.
 * Centralizes the mapping of operations to permission levels.
 */
export async function checkEconomyOperationPermission(
  member: InteractionGuildMember | null | undefined,
  operation:
    | "adjust_currency"
    | "transfer_currency"
    | "grant_item"
    | "remove_item",
): Promise<boolean> {
  const permissionMap: Record<typeof operation, EconomyPermissionLevel> = {
    adjust_currency: EconomyPermissionLevel.ADMIN, // Mod-only: can go negative (debt)
    transfer_currency: EconomyPermissionLevel.USER, // Users can transfer
    grant_item: EconomyPermissionLevel.ADMIN, // Mod-only
    remove_item: EconomyPermissionLevel.ADMIN, // Mod-only
  };

  return checkEconomyPermission(member, permissionMap[operation]);
}

/**
 * Factory for creating permission checkers bound to a specific member.
 * Use this in commands to create the checker function for services.
 */
export function createEconomyPermissionChecker(
  member: InteractionGuildMember | null | undefined,
) {
  return {
    /** Check if member can adjust currency (mod-only, debt allowed). */
    canAdjustCurrency: () =>
      checkEconomyPermission(member, EconomyPermissionLevel.ADMIN),
    /** Check if member can transfer currency (users allowed). */
    canTransfer: () =>
      checkEconomyPermission(member, EconomyPermissionLevel.USER),
    /** Check if member can grant items (mod-only). */
    canGrantItems: () =>
      checkEconomyPermission(member, EconomyPermissionLevel.ADMIN),
    /** Check if member can remove items (mod-only). */
    canRemoveItems: () =>
      checkEconomyPermission(member, EconomyPermissionLevel.ADMIN),
  };
}

/**
 * Legacy adapter for existing code that uses the simple (actorId, guildId?) => Promise<boolean> signature.
 * Note: This is less secure as it can't check actual Discord permissions without the member object.
 * Prefer using createPermissionChecker with the actual member when possible.
 */
export function createLegacyPermissionChecker(
  _actorId: UserId,
  member: InteractionGuildMember | null | undefined,
): (actorId: UserId, guildId?: string) => Promise<boolean> {
  return async () => {
    return checkEconomyPermission(member, EconomyPermissionLevel.ADMIN);
  };
}
