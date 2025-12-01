/**
 * Motivación: registrar el comando "moderation / tops / config" para activar y ajustar el sistema de TOPs por servidor.
 *
 * Idea/concepto: permite elegir canal, intervalo y tamaño del ranking; persiste la configuración y reinicia la ventana actual.
 *
 * Alcance: valida y guarda la configuración, delegando el almacenamiento y los contadores al sistema de TOPs.
 */
import {
  createBooleanOption,
  createChannelOption,
  createNumberOption,
  createStringOption,
  Declare,
  type GuildCommandContext,
  Options,
  SubCommand,
} from "seyfert";
import { ChannelType, MessageFlags } from "seyfert/lib/types";

import {
  getTopWindow,
  resetTopWindow,
  updateTopConfig,
} from "@/db/repositories";
import { TOP_DEFAULTS } from "@/db/models/tops.schema";
import { requireGuildId } from "@/utils/commandGuards";
import * as duration from "@/utils/ms";

const options = {
  canal: createChannelOption({
    description: "Canal donde se publicaran los reportes de TOPs",
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
  intervalo: createStringOption({
    description: "Cada cuanto se envia el reporte (ej: 24h, 3d, 1w)",
    required: false,
  }),
  tamano: createNumberOption({
    description: "Cantidad maxima de elementos por TOP (default 10)",
    required: false,
    min_value: 1,
    max_value: 50,
  }),
  desactivar: createBooleanOption({
    description: "Desactiva el sistema y borra el canal configurado",
    required: false,
  }),
  reiniciar: createBooleanOption({
    description: "Reiniciar contadores desde cero con la nueva config",
    required: false,
  }),
};

const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos para evitar spam accidental

@Declare({
  name: "config",
  description: "Configurar el sistema de tops",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
})
@Options(options)
export default class ConfigTopsCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = await requireGuildId(ctx);
    if (!guildId) return;

    const currentWindow = await getTopWindow(guildId);
    const disable = ctx.options.desactivar ?? false;
    if (disable) {
      await updateTopConfig(guildId, { channelId: null });
      await ctx.write({
        content: "Sistema de TOPs desactivado. No se enviarán nuevos reportes hasta configurar un canal nuevamente.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = ctx.options.canal;
    const intervalInput = ctx.options.intervalo;
    if (!channel || !intervalInput) {
      await ctx.write({
        content: "Debes indicar un canal y un intervalo (ej: `24h`, `3d`, `1w`).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const intervalMs = duration.parse(intervalInput);
    if (!intervalMs || intervalMs < MIN_INTERVAL_MS) {
      await ctx.write({
        content: `Intervalo inválido. Usa valores como \`12h\`, \`3d\`, \`1w\`. Minimo permitido: ${duration.format(MIN_INTERVAL_MS)}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const topSize =
      ctx.options.tamano && ctx.options.tamano > 0
        ? Math.min(Math.trunc(ctx.options.tamano), 50)
        : TOP_DEFAULTS.topSize;

    await updateTopConfig(guildId, {
      channelId: channel.id,
      intervalMs,
      topSize,
    });

    let resetNote = "";
    const shouldReset =
      ctx.options.reiniciar === true || !currentWindow.channelId;
    if (shouldReset) {
      await resetTopWindow(guildId, new Date());
      resetNote = "\nSe reinició la ventana actual para comenzar a contar desde ahora.";
    }

    await ctx.write({
      content: [
        "Configuración de TOPs guardada.",
        `Canal: <#${channel.id}>`,
        `Intervalo: ${duration.format(intervalMs, true)}`,
        `Tamaño de TOP: ${topSize}`,
        resetNote,
      ]
        .filter(Boolean)
        .join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }
}
