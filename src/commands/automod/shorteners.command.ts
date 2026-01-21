import type { GuildCommandContext } from "seyfert";
import {
  createBooleanOption,
  createStringOption,
  Declare,
  Options,
  SubCommand,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";
import { Middlewares } from "seyfert";

const options = {
  enabled: createBooleanOption({
    description: "Habilitar deteccion de acortadores",
    required: false,
  }),
  resolve_final_url: createBooleanOption({
    description: "Resolver URL final (mas costoso)",
    required: false,
  }),
  add: createStringOption({
    description: "Dominio de acortador a agregar (ej: bit.ly)",
    required: false,
  }),
  remove: createStringOption({
    description: "Dominio de acortador a eliminar",
    required: false,
  }),
};

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

@Options(options)
@Declare({
  name: "shorteners",
  description: "Configurar deteccion de acortadores de links",
})
@Guard({
  guildOnly: true,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class AutomodShortenersCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    const { enabled, resolve_final_url, add, remove } = ctx.options;

    if (
      enabled === undefined &&
      resolve_final_url === undefined &&
      add === undefined &&
      remove === undefined
    ) {
      const config = await configStore.get(
        guildId,
        ConfigurableModule.AutomodShorteners,
      );
      await ctx.write({
        content:
          `**AutoMod Shorteners:**\n` +
          `- Estado: ${config.enabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
          `- Resolver URL final: ${config.resolveFinalUrl ? "✅" : "❌"}\n` +
          `- Dominios: ${config.allowedShorteners.join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(
      guildId,
      ConfigurableModule.AutomodShorteners,
    );

    const nextDomains = new Set(
      (current.allowedShorteners ?? []).map((d: string) => d.toLowerCase().trim()),
    );

    if (add) {
      const domain = add.toLowerCase().trim();
      if (!DOMAIN_PATTERN.test(domain)) {
        await ctx.write({
          content: "Dominio invalido. Usa formato como `bit.ly`.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      nextDomains.add(domain);
    }

    if (remove) {
      const domain = remove.toLowerCase().trim();
      nextDomains.delete(domain);
    }

    const updates: Partial<typeof current> = {
      allowedShorteners: Array.from(nextDomains),
    };
    if (enabled !== undefined) updates.enabled = enabled;
    if (resolve_final_url !== undefined) updates.resolveFinalUrl = resolve_final_url;

    await configStore.set(guildId, ConfigurableModule.AutomodShorteners, updates);
    const updated = await configStore.get(guildId, ConfigurableModule.AutomodShorteners);

    await ctx.write({
      content:
        `**AutoMod Shorteners actualizado:**\n` +
        `- Estado: ${updated.enabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
        `- Resolver URL final: ${updated.resolveFinalUrl ? "✅" : "❌"}\n` +
        `- Dominios: ${updated.allowedShorteners.join(", ")}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
