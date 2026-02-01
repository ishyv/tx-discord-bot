/**
 * Motivación: registrar el comando "moderation / rep / shared" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import type { GuildCommandContext } from "seyfert";

import {
  GUILD_ONLY_MESSAGE,
  requireGuildPermission,
} from "@/utils/commandGuards";
import { Features } from "@/modules/features";

export interface RepCommandContext {
  guildId: string;
}

export interface RepContextOptions {
  requirePermission?: boolean;
}

/**
 * Ensures the reputation system is enabled for the guild and optionally enforces
 * ManageGuild permission for moderation-only subcommands.
 */
export async function requireRepContext(
  ctx: GuildCommandContext,
  options: RepContextOptions = {},
): Promise<RepCommandContext | null> {
  if (!ctx.guildId) {
    await ctx.write({ content: GUILD_ONLY_MESSAGE });
    return null;
  }

  if (options.requirePermission ?? true) {
    const allowed = await requireGuildPermission(ctx, {
      guildId: ctx.guildId,
      permissions: ["ManageGuild"],
    });

    if (!allowed) {
      return null;
    }
  }

  const enabled = await import("@/modules/features").then((m) =>
    m.isFeatureEnabled(ctx.guildId!, Features.Reputation),
  );
  if (!enabled) {
    await ctx.write({
      content: "El sistema de reputacion esta deshabilitado en este servidor.",
      flags: 64, // MessageFlags.Ephemeral
    });
    return null;
  }

  return { guildId: ctx.guildId };
}

const MAX_DELTA = 1_000_000;

export function normalizeRepAmount(
  input: number | null | undefined,
): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;
  const value = Math.trunc(input);
  if (value <= 0) return null;
  return Math.min(value, MAX_DELTA);
}

type RepChangeAction = "add" | "remove";

export function buildRepChangeMessage(
  action: RepChangeAction,
  amount: number,
  userId: string,
  total: number,
): string {
  const emoji = action === "add" ? "📈" : "📉";
  const verb = action === "add" ? "agregaron" : "removieron";
  return `${emoji} Se ${verb} ${amount} punto(s) de reputacion a <@${userId}>. Total actual: **${total}**.`;
}

import {
  ActionRow,
  Button,
  Embed,
  type TextGuildChannel,
  type Message,
  type User,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { Colors } from "@/modules/ui/colors";

export async function sendReputationRequest(
  channel: TextGuildChannel,
  targetMessage: Message,
  requester: User,
  isAutoDetected: boolean = false,
) {
  const embed = new Embed()
    .setColor(Colors.info)
    .setTitle("Solicitud de Revision de Reputacion")
    .setThumbnail(requester.avatarURL())
    .addFields([
      {
        name: "Usuario",
        value: `<@${requester.id}> (${requester.username})`,
        inline: false,
      },
      {
        name: "Hora",
        value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
        inline: false,
      },
      { name: "Mensaje", value: targetMessage.url },
    ]);

  if (isAutoDetected) {
    embed.setFooter({
      text: "Esta solicitud fue generada automaticamente por palabras clave.",
    });
  }

  const row1 = new ActionRow<Button>().addComponents(
    new Button()
      .setCustomId(`rep:accept:${requester.id}`)
      .setLabel("Aceptar (+1)")
      .setStyle(ButtonStyle.Success),
    new Button()
      .setCustomId(`rep:set:${requester.id}`)
      .setLabel("Valor Manual")
      .setStyle(ButtonStyle.Primary),
    new Button()
      .setCustomId(`rep:deny:${requester.id}`)
      .setLabel("Rechazar (-1)")
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRow<Button>().addComponents(
    new Button()
      .setCustomId(`rep:close`)
      .setLabel("Cerrar")
      .setStyle(ButtonStyle.Secondary),
    new Button()
      .setCustomId(`rep:penalize:${requester.id}`)
      .setLabel("Penalizar")
      .setStyle(ButtonStyle.Danger),
  );

  await channel.messages.write({
    embeds: [embed],
    components: [row1, row2],
  });
}
