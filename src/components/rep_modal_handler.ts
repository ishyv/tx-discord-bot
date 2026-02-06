/**
 * Rep Modal Handler Component
 */
import { Embed, ModalCommand, ModalContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { adjustUserReputation } from "@/db/repositories";
import { AutoroleService } from "@/modules/autorole";
import { buildRepChangeMessage } from "@/commands/moderation/rep/shared";
import { logModerationAction } from "@/utils/moderationLogger";
import { assertFeatureEnabled, Features } from "@/modules/features";
import { recordReputationChange } from "@/systems/tops";

/**
 * Rehydrate the original embed so the modal response can show who reviewed the request.
 */
function resolveRequestEmbed(ctx: ModalContext, footerText: string) {
  const baseEmbed = ctx.interaction.message?.embeds?.[0];
  if (!baseEmbed) return null;

  const embed = new Embed(baseEmbed);
  embed.setFooter({ text: footerText });
  return embed;
}

/**
 * Modal submissions return action rows; walk them to pull a specific input value.
 */
function getTextInputValue(ctx: ModalContext, customId: string): string | null {
  for (const row of ctx.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.customId === customId) {
        return component.value ?? null;
      }
    }
  }
  return null;
}

export default class RepModalHandler extends ModalCommand {
  /** Handles the modal submission for manual reputation amounts. */
  filter(ctx: ModalContext) {
    return ctx.customId.startsWith("rep:modal:");
  }

  async run(ctx: ModalContext) {
    const [_, __, targetId] = ctx.customId.split(":");
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

    const rawAmount = getTextInputValue(ctx, "amount") ?? "";
    const amount = parseInt(rawAmount);

    if (isNaN(amount) || amount === 0 || amount < -5 || amount > 5) {
      await ctx.write({
        content:
          "Amount must be a number between -5 and 5, and cannot be 0.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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

    const embed = resolveRequestEmbed(
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

    await ctx.editOrReply(payload);

    await logModerationAction(
      ctx.client,
      guildId,
      {
        title: "Reputation Request Reviewed (Manual)",
        description: `${amount > 0 ? "Added" : "Removed"} ${Math.abs(amount)} point(s) ${amount > 0 ? "to" : "from"} <@${targetId}> via manual request.`,
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
