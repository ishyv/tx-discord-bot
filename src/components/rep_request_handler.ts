/**
 * Purpose: Handle moderation actions for reputation requests via button UI.
 * Context: ComponentCommand bound to "rep:" button custom IDs.
 * Dependencies: Autorole service, reputation storage, moderation logging.
 * Invariants:
 * - Custom IDs are `rep:<action>:<targetId>`.
 * - Cooldown penalties must match the command name used by rep requests.
 * Gotchas:
 * - Changing the "request" command name breaks penalty enforcement.
 */
import {
  ActionRow,
  ComponentCommand,
  ComponentContext,
  Embed,
  Modal,
  TextInput,
} from "seyfert";
import { MessageFlags, TextInputStyle } from "seyfert/lib/types";
import { adjustUserReputation } from "@/db/repositories";
import { AutoroleService } from "@/modules/autorole";
import { buildRepChangeMessage } from "@/commands/moderation/rep/shared";
import { logModerationAction } from "@/utils/moderationLogger";
import { CooldownType } from "@/modules/cooldown";
import { assertFeatureEnabled, Features } from "@/modules/features";
import { recordReputationChange } from "@/systems/tops";

const PENALTY_MS = 1_800_000; // 30 minutes

/**
 * Load the original request embed from the interaction response so we can append
 * reviewer status without rebuilding the whole message.
 */
async function resolveRequestEmbed(
  ctx: ComponentContext<"Button">,
  footerText: string,
) {
  try {
    const baseEmbed = ctx.interaction.message?.embeds?.[0];
    if (!baseEmbed) return null;

    const embed = new Embed(baseEmbed);
    embed.setFooter({ text: footerText });
    return embed;
  } catch (error) {
    ctx.client.logger?.warn?.("[rep] failed to fetch request message", {
      error,
      guildId: ctx.guildId,
      messageId: ctx.interaction.message?.id,
    });
    return null;
  }
}

/**
 * Routes button interactions for reputation requests.
 *
 * Side effects: Writes moderation logs, adjusts reputation, and may extend cooldowns.
 */
export default class RepRequestHandler extends ComponentCommand {
  componentType = "Button" as const;

  /** Routes review actions for reputation requests (accept/deny/set/close/penalize). */
  filter(ctx: ComponentContext<"Button">) {
    return ctx.customId.startsWith("rep:");
  }

  async run(ctx: ComponentContext<"Button">) {
    const [_, action, targetId] = ctx.customId.split(":");

    if (action === "close") {
      await ctx.deferUpdate();
      await ctx.interaction.message?.delete();
      return;
    }

    if (!targetId) return;

    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content:
          "Could not determine the guild for this request.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const enabled = await assertFeatureEnabled(
      ctx as any,
      Features.Reputation,
      "The reputation system is disabled in this server.",
    );
    if (!enabled) return;

    if (action === "set") {
      // Show a modal so reviewers can set a custom reputation delta.
      const modal = new Modal()
        .setCustomId(`rep:modal:${targetId}`)
        .setTitle("Set Manual Reputation")
        .addComponents(
          new ActionRow<TextInput>().addComponents(
            new TextInput()
              .setCustomId("amount")
              .setLabel("Amount (-5 to 5, not 0)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("Ex: 3, -2"),
          ),
        );
      await ctx.interaction.modal(modal);
      return;
    }

    if (action === "penalize") {
      const commandName = "request";
      const cooldownType = CooldownType.User;
      const commandInterval = 300_000;
      const penalty = PENALTY_MS; // add 30 minutes on top of the base interval

      // WHY: Override expiration so the base cooldown is extended without timers.
      // RISK: If commandName changes, this penalty silently stops applying.
      ctx.client.cooldown.set({
        name: commandName,
        type: cooldownType,
        target: targetId,
        durationMs: commandInterval + penalty,
      });

      const penaltyMinutes = Math.round(penalty / 60_000);
      const totalMinutes = Math.round((penalty + commandInterval) / 60_000);

      await ctx.write({
        content: `Extended cooldown by ${penaltyMinutes}m (total ~${totalMinutes}m) for <@${targetId}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.deferUpdate();

    let amount = 0;
    if (action === "accept") amount = 1;
    if (action === "deny") amount = -1;

    const totalResult = await adjustUserReputation(targetId, amount);
    if (totalResult.isErr()) {
      await ctx.write({
        content: "Could not update reputation.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const total = totalResult.unwrap();
    await recordReputationChange(ctx.client, guildId, targetId, amount);
    await AutoroleService.syncUserReputationRoles(
      ctx.client,
      guildId,
      targetId,
      total,
    );

    const embed = await resolveRequestEmbed(
      ctx,
      `Revisado por ${ctx.author.username}`,
    );

    const payload: {
      content: string;
      components: [];
      embeds?: Embed[];
    } = {
      content: buildRepChangeMessage(
        amount > 0 ? "add" : "remove",
        Math.abs(amount),
        targetId,
        total,
      ),
      components: [],
    };

    if (embed) payload.embeds = [embed];

    try {
      await ctx.editResponse(payload);
    } catch (error) {
      ctx.client.logger?.warn?.(
        "[rep] failed to edit response for rep request",
        {
          error,
          guildId,
          messageId: ctx.interaction.message?.id,
        },
      );
    }

    await logModerationAction(
      ctx.client,
      guildId,
      {
        title: "Reputation Request Reviewed",
        description: `${amount > 0 ? "Added" : "Removed"} ${Math.abs(amount)} point(s) ${amount > 0 ? "to" : "from"} <@${targetId}> via request.`,
        fields: [
          { name: "Total", value: `${total}`, inline: true },
          { name: "Moderator", value: `<@${ctx.author.id}>`, inline: true },
        ],
        actorId: ctx.author.id,
      },
      "pointsLog",
    );
  }
}
