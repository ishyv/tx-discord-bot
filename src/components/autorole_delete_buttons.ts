/**
 * Motivación: encapsular el handler de componente "autorole delete buttons" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import {
  ActionRow,
  Button,
  ComponentCommand,
  Embed,
  type ComponentContext,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { deleteRule, purgeRule } from "@/db/repositories";
import {
  clearDeleteSession,
  getDeleteSession,
  type DeleteSession,
} from "@/systems/autorole/deleteSessions";
import { logModerationAction } from "@/utils/moderationLogger";

const ID_PREFIX = "autorole:delete:";

export default class AutoroleDeleteButtons extends ComponentCommand {
  componentType = "Button" as const;

  filter(ctx: ComponentContext<"Button">) {
    return ctx.customId.startsWith(ID_PREFIX);
  }

  async run(ctx: ComponentContext<"Button">) {
    if (!ctx.guildId) return;

    const parts = ctx.customId.split(":");
    const action = parts[2];
    const slug = parts[3];

    if (!action || !slug) {
      await ctx.write({
        content: "Esta accion ya no es valida.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const messageId = ctx.interaction.message?.id;
    if (!messageId) {
      await ctx.write({
        content: "No pude resolver el mensaje para esta accion.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const session = getDeleteSession(messageId);
    if (!session) {
      await ctx.write({
        content: "Esta accion expiro. Ejecuta el comando nuevamente.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (Date.now() > session.expiresAt) {
      clearDeleteSession(messageId);
      await disableWithStatus(ctx, slug, "Expirado");
      return;
    }

    const hasPermission =
      ctx.author.id === session.invokerId ||
      ctx.member?.permissions?.has?.(["ManageRoles"]) === true;

    if (!hasPermission) {
      await ctx.write({
        content: "Necesitas ManageRoles o ser quien inicio la eliminacion.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    switch (action) {
      case "confirm":
        await this.handleConfirm(ctx, session, messageId);
        break;
      case "cancel":
        await this.handleCancel(ctx, session.slug, messageId);
        break;
      case "purge":
        await this.handlePurge(ctx, session);
        break;
      default:
        await ctx.write({
          content: "Accion desconocida.",
          flags: MessageFlags.Ephemeral,
        });
    }
  }

  private async handleConfirm(
    ctx: ComponentContext<"Button">,
    session: DeleteSession,
    messageId: string,
  ) {
    await ctx.deferUpdate();
    let deleted = false;
    try {
      deleted = await deleteRule(session.guildId, session.slug);
    } catch (error) {
      ctx.client.logger?.error?.("[autorole] rule delete failed", {
        guildId: session.guildId,
        ruleName: session.slug,
        actorId: ctx.author.id,
        error,
      });
    }

    if (!deleted) {
      await ctx.followup({
        content: "No se pudo eliminar la regla. Intenta nuevamente.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    clearDeleteSession(messageId);
    ctx.client.logger?.info?.("[autorole] rule deleted", {
      guildId: session.guildId,
      ruleName: session.slug,
      actorId: ctx.author.id,
    });

    await logModerationAction(ctx.client, session.guildId, {
      title: "Autorole eliminado",
      description: `Regla \`${session.slug}\` eliminada`,
      actorId: ctx.author.id,
    });
    await disableWithStatus(ctx, session.slug, "Regla eliminada");
  }

  private async handleCancel(
    ctx: ComponentContext<"Button">,
    slug: string,
    messageId: string,
  ) {
    await ctx.deferUpdate();
    clearDeleteSession(messageId);
    await disableWithStatus(ctx, slug, "Cancelado");
  }

  private async handlePurge(
    ctx: ComponentContext<"Button">,
    session: DeleteSession,
  ) {
    await ctx.deferUpdate();
    const result = await purgeRule(ctx.client, session.guildId, session.slug);
    ctx.client.logger?.info?.("[autorole] rule purged", {
      guildId: session.guildId,
      ruleName: session.slug,
      actorId: ctx.author.id,
      removedGrants: result.removedGrants,
      roleRevocations: result.roleRevocations,
    });

    await logModerationAction(ctx.client, session.guildId, {
      title: "Autorole purgado",
      description: `Regla \`${session.slug}\` purgada`,
      fields: [
        { name: "Razones eliminadas", value: `${result.removedGrants}`, inline: true },
        { name: "Roles actualizados", value: `${result.roleRevocations}`, inline: true },
      ],
      actorId: ctx.author.id,
    });

    try {
      const message = await ctx.fetchResponse();
      const baseEmbed = message.embeds?.[0];
      const embed = new Embed(baseEmbed);
      embed.setFooter({
        text: `Purgado: se eliminaron ${result.removedGrants} razones y se actualizaron ${result.roleRevocations} roles.`,
      });

      await ctx.editResponse({
        embeds: [embed],
      });
    } catch (error) {
      ctx.client.logger?.warn?.("[autorole] failed to update purge embed", {
        error,
        guildId: session.guildId,
        messageId: ctx.interaction.message?.id,
      });
    }
  }
}

async function disableWithStatus(
  ctx: ComponentContext<"Button">,
  slug: string,
  status: string,
) {
  const message = await ctx.fetchResponse();
  const baseEmbed = message.embeds?.[0];
  const embed = new Embed(baseEmbed);
  embed.setFooter({ text: status });

  await ctx.editResponse({
    embeds: [embed],
    components: [buildDisabledRow(slug)],
  });
}

function buildDisabledRow(slug: string) {
  const confirm = new Button()
    .setCustomId(`autorole:delete:confirm:${slug}`)
    .setLabel("Confirmar eliminacion")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);
  const purge = new Button()
    .setCustomId(`autorole:delete:purge:${slug}`)
    .setLabel("Purgar asignaciones activas")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const cancel = new Button()
    .setCustomId(`autorole:delete:cancel:${slug}`)
    .setLabel("Cancelar")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  return new ActionRow<Button>().addComponents(confirm, purge, cancel);
}

