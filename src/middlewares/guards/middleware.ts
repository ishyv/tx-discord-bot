/**
 * Purpose: Enforce guard metadata (guild-only, feature flags, permissions).
 * Context: Global middleware in the command pipeline.
 * Dependencies: Guard metadata decorator, feature service, guild-role overrides.
 * Invariants:
 * - Guards run before command logic executes.
 * - Guild-only checks must happen before permission checks.
 * Gotchas:
 * - stop() triggers onMiddlewaresError; commands with custom handlers must avoid double replies.
 * - Feature checks require a guild context; DMs bypass feature checks.
 */
import { createMiddleware } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { getGuardMetadata } from "./decorator";
import {
  collectMemberRoleIds,
  memberHasDiscordPermission,
  GUILD_ONLY_MESSAGE,
} from "@/utils/commandGuards";
import { resolveRoleActionPermission } from "@/modules/guild-roles";
import { isFeatureEnabled } from "@/modules/features";

const DEFAULT_PERMISSION_DENIED_MESSAGE =
  "[!] No tienes permisos suficientes para ejecutar este comando.";
const DEFAULT_OVERRIDE_DENIED_MESSAGE =
  "[!] Un override configurado en el bot bloquea este comando.";

/**
 * Guard middleware implementation.
 *
 * Behavior:
 * - Validates guild-only constraints.
 * - Validates feature toggles (when configured).
 * - Resolves Discord permissions + role overrides.
 *
 * Side effects: Sends ephemeral responses on denial.
 */
export const guardMiddleware = createMiddleware<void>(
  async ({ context, next, stop }) => {
    const command = (context as any).command;
    const metadata = getGuardMetadata(command);

    // WHY: No metadata means the command opted out of guard checks.
    if (!metadata) return next();

    // 1) Guild-only validation must happen before any guild-based lookup.
    if (metadata.guildOnly && !context.guildId) {
      await context.write({
        content: GUILD_ONLY_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
      return stop("No guild context");
    }

    // If not in a guild, skip feature/permission checks (they are guild-scoped).
    if (!context.guildId) return next();
    const guildId = context.guildId;

    // 2) Feature toggle validation (when configured).
    if (metadata.feature) {
      const enabled = await isFeatureEnabled(guildId, metadata.feature as any);
      if (!enabled) {
        await context.write({
          content: `Esta caracteristica (\`${metadata.feature}\`) esta deshabilitada en este servidor. Un administrador puede habilitarla desde el dashboard.`,
          flags: MessageFlags.Ephemeral,
        });
        return stop("Feature disabled");
      }
    }

    // 3) Permission + override resolution.
    const permissions = metadata.permissions;
    const ctx = context as any;
    const actionKey =
      metadata.actionKey ?? ctx.fullCommandName ?? ctx.commandName ?? ctx.name;

    const member = context.member;
    const memberRoleIds = await collectMemberRoleIds(member);
    const hasDiscordPermission = await memberHasDiscordPermission(
      member,
      permissions,
    );

    const decision = await resolveRoleActionPermission({
      guildId,
      actionKey: actionKey
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
      memberRoleIds: [...memberRoleIds],
      hasDiscordPermission,
    });

    if (decision.allowed) {
      return next();
    }

    // 4) Standardized denial response.
    const message =
      decision.decision === "override-deny"
        ? DEFAULT_OVERRIDE_DENIED_MESSAGE
        : DEFAULT_PERMISSION_DENIED_MESSAGE;

    await context.write({
      content: message,
      flags: MessageFlags.Ephemeral,
    });

    return stop("Permission denied");
  },
);
