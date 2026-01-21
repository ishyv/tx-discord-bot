import type { GuildCommandContext } from "seyfert";
import {
  Middlewares,
  Options,
  SubCommand,
  createBooleanOption,
  createChannelOption,
  createIntegerOption,
  createStringOption,
  Declare,
} from "seyfert";
import { ChannelType, MessageFlags } from "seyfert/lib/types";
import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
  enabled: createBooleanOption({
    description: "Habilitar o deshabilitar el automod de linkspam",
    required: false,
  }),
  maxLinks: createIntegerOption({
    description: "Maximo de links permitidos dentro de la ventana",
    required: false,
    min_value: 1,
  }),
  windowSeconds: createIntegerOption({
    description: "Ventana de tiempo en segundos",
    required: false,
    min_value: 1,
  }),
  timeoutSeconds: createIntegerOption({
    description: "Timeout en segundos al disparar (si el bot puede)",
    required: false,
    min_value: 1,
  }),
  action: createStringOption({
    description: "Accion al detectar spam (timeout, mute, delete, report)",
    required: false,
    choices: [
      { name: "timeout", value: "timeout" },
      { name: "mute", value: "mute" },
      { name: "delete", value: "delete" },
      { name: "report", value: "report" },
    ],
  }),
  report_channel: createChannelOption({
    description: "Canal para reportes cuando action=report",
    required: false,
    channel_types: [ChannelType.GuildText],
  }),
};

@Declare({
  name: "linkspam",
  description: "Configurar el filtro de spam de links",
})
@Options(options)
@Guard({
  guildOnly: true,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class AutomodLinkSpamCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;

    const { enabled, maxLinks, windowSeconds, timeoutSeconds, action, report_channel } = ctx.options;

    if (
      enabled === undefined &&
      maxLinks === undefined &&
      windowSeconds === undefined &&
      timeoutSeconds === undefined &&
      action === undefined &&
      report_channel === undefined
    ) {
      const config = await configStore.get(guildId, ConfigurableModule.AutomodLinkSpam);
      await ctx.write({
        content:
          `**AutoMod LinkSpam:**\n` +
          `- Estado: ${config.enabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
          `- Max links: \`${config.maxLinks}\`\n` +
          `- Ventana: \`${config.windowSeconds}\`s\n` +
          `- Timeout: \`${config.timeoutSeconds}\`s\n` +
          `- Accion: \`${config.action}\`\n` +
          `- Canal reporte: ${config.reportChannelId ? `<#${config.reportChannelId}>` : "(no configurado)"}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(guildId, ConfigurableModule.AutomodLinkSpam);
    const updates: Partial<typeof current> = {};
    if (enabled !== undefined) updates.enabled = enabled;
    if (maxLinks !== undefined) updates.maxLinks = maxLinks;
    if (windowSeconds !== undefined) updates.windowSeconds = windowSeconds;
    if (timeoutSeconds !== undefined) updates.timeoutSeconds = timeoutSeconds;
    if (action !== undefined) updates.action = action as typeof current.action;
    if (report_channel !== undefined) updates.reportChannelId = report_channel.id;

    await configStore.set(guildId, ConfigurableModule.AutomodLinkSpam, updates);
    const updated = await configStore.get(guildId, ConfigurableModule.AutomodLinkSpam);

    await ctx.write({
      content:
        `**AutoMod LinkSpam actualizado:**\n` +
        `- Estado: ${updated.enabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
        `- Max links: \`${updated.maxLinks}\`\n` +
        `- Ventana: \`${updated.windowSeconds}\`s\n` +
        `- Timeout: \`${updated.timeoutSeconds}\`s\n` +
        `- Accion: \`${updated.action}\`\n` +
        `- Canal reporte: ${updated.reportChannelId ? `<#${updated.reportChannelId}>` : "(no configurado)"}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
