/**
 * Motivación: encapsular el handler de componente "rep request handler" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
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
import { syncUserReputationRoles } from "@/systems/autorole/service";
import { buildRepChangeMessage } from "@/commands/moderation/rep/shared";
import { logModerationAction } from "@/utils/moderationLogger";
import { CooldownType } from "@/modules/cooldown";
import { assertFeatureEnabled } from "@/modules/features";
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
        content: "No se pudo determinar el servidor para procesar la solicitud.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const enabled = await assertFeatureEnabled(
      ctx as any,
      "reputation",
      "El sistema de reputacion esta deshabilitado en este servidor.",
    );
    if (!enabled) return;

    if (action === "set") {
      // Show a modal so reviewers can set a custom reputation delta.
      const modal = new Modal()
        .setCustomId(`rep:modal:${targetId}`)
        .setTitle("Establecer Reputacion Manual")
        .addComponents(
          new ActionRow<TextInput>().addComponents(
            new TextInput()
              .setCustomId("amount")
              .setLabel("Cantidad (-5 a 5, no 0)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("Ej: 3, -2"),
          ),
        );
      await ctx.interaction.modal(modal);
      return;
    }

    if (action === "penalize") {
      const now = Date.now();
      const commandName = "request";
      const cooldownType = CooldownType.User;
      const commandInterval = 300_000;
      const penalty = PENALTY_MS; // add 30 minutes on top of the base interval

      // Extend the user cooldown by writing a future lastDrip to the cooldown store.
      await ctx.client.cooldown.set({
        name: commandName,
        type: cooldownType,
        target: targetId,
        interval: commandInterval,
        remaining: 0,
        lastDrip: now + penalty,
      });

      const penaltyMinutes = Math.round(penalty / 60_000);
      const totalMinutes = Math.round((penalty + commandInterval) / 60_000);

      await ctx.write({
        content: `Se extendio el cooldown ${penaltyMinutes}m adicionales (total ~${totalMinutes}m) para <@${targetId}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.deferUpdate();

    let amount = 0;
    if (action === "accept") amount = 1;
    if (action === "deny") amount = -1;

    const total = await adjustUserReputation(targetId, amount);
    await recordReputationChange(ctx.client, guildId, targetId, amount);
    await syncUserReputationRoles(ctx.client, guildId, targetId, total);

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
      ctx.client.logger?.warn?.("[rep] failed to edit response for rep request", {
        error,
        guildId,
        messageId: ctx.interaction.message?.id,
      });
    }

    await logModerationAction(
      ctx.client,
      guildId,
      {
        title: "Solicitud de Reputacion Revisada",
        description: `Se ${amount > 0 ? "agrego" : "removio"} ${Math.abs(amount)} punto(s) a <@${targetId}> via solicitud.`,
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
