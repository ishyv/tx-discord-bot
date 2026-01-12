/**
 * Motivación: registrar el comando "moderation / autorole / delete" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import {
  ActionRow,
  Button,
  Declare,
  Embed,
  Options,
  SubCommand,
  createStringOption,
  type GuildCommandContext,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";

import {
  AutoRoleRulesStore,
  autoroleKeys,
  clearDeleteSession,
  getDeleteSession,
  storeDeleteSession,
} from "@/modules/autorole";

import {
  formatRuleMode,
  formatTrigger,
  respondRuleAutocomplete,
  requireAutoroleContext,
} from "./shared";

const options = {
  name: createStringOption({
    description: "Nombre de la regla a eliminar",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

const TTL_MS = 60_000;

@Declare({
  name: "delete",
  description: "Eliminar una regla de auto-role",
})
@Options(options)
export default class AutoroleDeleteCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const slug = ctx.options.name.trim().toLowerCase();
    const id = autoroleKeys.rule(context.guildId, slug);
    const res = await AutoRoleRulesStore.get(id);
    const rule = res.isOk() ? res.unwrap() : null;
    if (!rule) {
      await ctx.write({ content: `No existe una regla llamada \`${slug}\`.` });
      return;
    }

    const embed = new Embed()
      .setTitle(`Eliminar regla de auto-role: ${rule.name}`)
      .setColor(EmbedColors.Red)
      .setFields([
        {
          name: "Disparador",
          value: `\`${formatTrigger(rule.trigger)}\``,
          inline: false,
        },
        {
          name: "Rol",
          value: `<@&${rule.roleId}>`,
          inline: false,
        },
        {
          name: "Modo",
          value: formatRuleMode(rule),
          inline: false,
        },
        {
          name: "Nota",
          value:
            "Las asignaciones temporales no se revocan automaticamente. Usa **Purgar asignaciones activas** para retirar los roles actuales.",
        },
      ]);

    const { row } = buildButtonRow(rule.name);

    const message = await ctx.editOrReply(
      {
        embeds: [embed],
        components: [row],
      },
      true,
    );

    if (!message) return;

    storeDeleteSession({
      messageId: message.id,
      channelId: message.channelId ?? ctx.channelId,
      guildId: context.guildId,
      slug: rule.name,
      invokerId: ctx.author.id,
      expiresAt: Date.now() + TTL_MS,
    });

    scheduleExpiry(ctx, message.id, message.channelId ?? ctx.channelId);
  }
}

function buildButtonRow(slug: string) {
  const confirm = new Button()
    .setCustomId(`autorole:delete:confirm:${slug}`)
    .setLabel("Confirmar eliminacion")
    .setStyle(ButtonStyle.Danger);
  const purge = new Button()
    .setCustomId(`autorole:delete:purge:${slug}`)
    .setLabel("Purgar asignaciones activas")
    .setStyle(ButtonStyle.Primary);
  const cancel = new Button()
    .setCustomId(`autorole:delete:cancel:${slug}`)
    .setLabel("Cancelar")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRow<Button>().addComponents(confirm, purge, cancel);
  return { row, confirm, purge, cancel };
}

function scheduleExpiry(
  ctx: GuildCommandContext,
  messageId: string,
  channelId: string,
) {
  setTimeout(async () => {
    const session = getDeleteSession(messageId);
    if (!session) return;
    if (Date.now() <= session.expiresAt) return;

    clearDeleteSession(messageId);

    const row = buildDisabledRow(session.slug);

    try {
      const current = await ctx.client.messages.fetch(messageId, channelId).catch(() => null);
      const embedJson = current?.embeds?.[0]
        ? [new Embed(current.embeds[0]).setFooter({ text: "Expirado" }).toJSON()]
        : undefined;
      await ctx.client.messages.edit(messageId, channelId, {
        components: [row],
        content: "Expirado",
        embeds: embedJson,
      });
    } catch (error) {
      ctx.client.logger?.warn?.("[autorole] failed to expire delete flow", {
        error,
        guildId: session.guildId,
        messageId,
      });
    }
  }, TTL_MS + 1_000);
}
function buildDisabledRow(slug: string): ActionRow<Button> {
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

