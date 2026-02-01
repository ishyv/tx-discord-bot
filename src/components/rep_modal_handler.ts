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
          "No se pudo determinar el servidor para procesar la solicitud.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const enabled = await assertFeatureEnabled(
      ctx as any,
      Features.Reputation,
      "El sistema de reputacion esta deshabilitado en este servidor.",
    );
    if (!enabled) return;

    const rawAmount = getTextInputValue(ctx, "amount") ?? "";
    const amount = parseInt(rawAmount);

    if (isNaN(amount) || amount === 0 || amount < -5 || amount > 5) {
      await ctx.write({
        content:
          "La cantidad debe ser un numero entre -5 y 5, y no puede ser 0.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const totalResult = await adjustUserReputation(targetId, amount);
    if (totalResult.isErr()) {
      await ctx.write({
        content: "No se pudo actualizar la reputacion.",
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
        title: "Solicitud de Reputacion Revisada (Manual)",
        description: `Se ${amount > 0 ? "agrego" : "removio"} ${Math.abs(amount)} punto(s) a <@${targetId}> via solicitud manual.`,
        fields: [
          { name: "Total", value: `${total}`, inline: true },
          { name: "Moderador", value: `<@${ctx.author.id}>`, inline: true },
        ],
        actorId: ctx.author.id,
      },
      "pointsLog",
    );
  }
}
