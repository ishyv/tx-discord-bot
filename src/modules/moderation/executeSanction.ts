/**
 * Shared pipeline for all moderation sanction commands (ban, kick, mute, restrict).
 *
 * Provides a single execute path: validate → act → respond → record case → log.
 * Contract: **never crashes the process**. All errors are caught and surfaced
 * as ephemeral replies to the moderator.
 */
import type { GuildCommandContext } from "seyfert";
import {
  Embed,
  InteractionGuildMember,
} from "seyfert";
import type { ColorResolvable } from "seyfert/lib/common";
import type { APIEmbedField } from "seyfert/lib/types";
import { MessageFlags } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";
import { registerCase } from "@/modules/moderation/service";
import type { SanctionType } from "@/db/schemas/user";
import type { GuildLogger } from "@/utils/guildLogger";
import type { CHANNELS_ID } from "@/constants/guild";

/** The user option from Seyfert can be a User or InteractionGuildMember. */
type UserLike = {
  id: string;
  username: string;
  // biome-ignore lint: Seyfert overloads make strict typing impractical here.
  avatarURL: (...args: any[]) => any;
};

export interface SanctionParams {
  ctx: GuildCommandContext;
  targetUser: UserLike;
  reason: string;
  caseType: SanctionType;
  /** The Discord API call to perform (e.g. ban, kick, timeout). */
  execute: (member: InteractionGuildMember) => Promise<unknown>;
  /** Title for the success embed shown to the moderator. */
  successTitle: string;
  /** Extra lines appended to the success embed description (e.g. duration). */
  extraSuccessLines?: string[];
  /** Title for the log embed sent to the log channel. */
  logTitle: string;
  /** Color for the log embed. */
  logColor: ColorResolvable;
  /** Extra fields appended to the log embed (e.g. duration, restriction type). */
  extraLogFields?: APIEmbedField[];
  /** Override the default log channel (banSanctions). */
  logChannel?: keyof typeof CHANNELS_ID;
}

/**
 * Executes a moderation sanction through a standardized pipeline.
 *
 * 1. Validates the target (self-check, member resolution, moderatable).
 * 2. Executes the Discord API action inside a try/catch.
 * 3. Sends a success embed to the moderator (ephemeral).
 * 4. Records the case in the database (failure is logged, not thrown).
 * 5. Sends a log embed to the configured log channel (failure is logged, not thrown).
 */
export async function executeSanction(params: SanctionParams): Promise<void> {
  const {
    ctx,
    targetUser,
    reason,
    caseType,
    execute,
    successTitle,
    extraSuccessLines,
    logTitle,
    logColor,
    extraLogFields,
    logChannel,
  } = params;

  try {
    // --- Validate target ---

    if (ctx.author.id === targetUser.id) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "You cannot apply this action to yourself.",
      });
      return;
    }

    // Runtime check: the user option resolves to InteractionGuildMember
    // when the target is in the guild. The cast is safe because we guard
    // with instanceof before using any member-specific API.
    const targetMember =
      (targetUser as unknown) instanceof InteractionGuildMember
        ? (targetUser as unknown as InteractionGuildMember)
        : undefined;

    if (!targetMember) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "Could not find the member in the server.",
      });
      return;
    }

    if (!(await targetMember.moderatable())) {
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content:
          "You cannot apply this action to a user with a role equal to or higher than yours.",
      });
      return;
    }

    // --- Execute the Discord API action ---

    try {
      await execute(targetMember);
    } catch (apiError) {
      ctx.client.logger?.error?.(
        `[moderation] ${caseType} API call failed`,
        { error: apiError, targetId: targetUser.id, guildId: ctx.guildId },
      );
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content:
          "The action could not be completed. Discord may have rejected the request (permissions, rate limit, or the user left).",
      });
      return;
    }

    // --- Respond to moderator ---

    const descriptionLines = [
      `The user **${targetUser.username}** was successfully affected.`,
      "",
      `**Reason:** ${reason}`,
      ...(extraSuccessLines ?? []),
    ];

    const successEmbed = new Embed({
      title: successTitle,
      description: descriptionLines.join("\n"),
      color: UIColors.success,
      footer: {
        text: `By ${ctx.author.username}`,
        icon_url: ctx.author.avatarURL(),
      },
    });

    await ctx.editOrReply({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed],
    });

    // --- Record case (fire-and-forget, never crash) ---

    try {
      const result = await registerCase(
        targetUser.id,
        ctx.guildId,
        caseType,
        reason,
      );
      if (result.isErr()) {
        ctx.client.logger?.warn?.(
          `[moderation] registerCase returned error for ${caseType}`,
          { error: result.error, targetId: targetUser.id, guildId: ctx.guildId },
        );
      }
    } catch (caseError) {
      ctx.client.logger?.warn?.(
        `[moderation] registerCase threw for ${caseType}`,
        { error: caseError, targetId: targetUser.id, guildId: ctx.guildId },
      );
    }

    // --- Log to channel (fire-and-forget, never crash) ---

    try {
      const logger: GuildLogger = await ctx.getGuildLogger();
      await logger.moderationLog(
        {
          title: logTitle,
          color: logColor,
          thumbnail: await targetUser.avatarURL(),
          fields: [
            {
              name: "User",
              value: `${targetUser.username} (${targetUser.id})`,
              inline: true,
            },
            { name: "Reason", value: reason, inline: false },
            ...(extraLogFields ?? []),
          ],
          footer: {
            text: `${ctx.author.username} (${ctx.author.id})`,
            iconUrl: ctx.author.avatarURL(),
          },
          actorId: ctx.author.id,
        },
        logChannel,
      );
    } catch (logError) {
      ctx.client.logger?.warn?.(
        `[moderation] channel log failed for ${caseType}`,
        { error: logError, guildId: ctx.guildId },
      );
    }
  } catch (outerError) {
    // Top-level safety net — absolutely nothing escapes.
    try {
      ctx.client.logger?.error?.(
        "[moderation] unexpected error in executeSanction",
        { error: outerError, guildId: ctx.guildId },
      );
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "An unexpected error occurred while processing the action.",
      });
    } catch {
      // Even the error reply failed — nothing more we can do.
    }
  }
}

/**
 * Wraps a moderation command's run() body so that unhandled errors
 * never crash the process. Use this for commands that don't go through
 * executeSanction (e.g. cases, warn list).
 */
export async function safeModerationRun(
  ctx: GuildCommandContext,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    try {
      ctx.client.logger?.error?.(
        "[moderation] unhandled error in command run()",
        { error, guildId: ctx.guildId },
      );
      await ctx.editOrReply({
        flags: MessageFlags.Ephemeral,
        content: "An unexpected error occurred while processing the command.",
      });
    } catch {
      // Even the error reply failed — nothing more we can do.
    }
  }
}
