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
    description: "Habilitar o deshabilitar el whitelist de dominios",
    required: false,
  }),
  add: createStringOption({
    description: "Dominio a agregar (ej: github.com)",
    required: false,
  }),
  remove: createStringOption({
    description: "Dominio a eliminar",
    required: false,
  }),
};

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

@Options(options)
@Declare({
  name: "whitelist",
  description: "Configurar whitelist de dominios para AutoMod",
})
@Guard({
  guildOnly: true,
  permissions: ["ManageGuild"],
})
@Middlewares(["guard"])
export default class AutomodWhitelistCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = ctx.guildId;
    const { enabled, add, remove } = ctx.options;

    if (enabled === undefined && add === undefined && remove === undefined) {
      const config = await configStore.get(
        guildId,
        ConfigurableModule.AutomodDomainWhitelist,
      );
      await ctx.write({
        content:
          `**AutoMod Domain Whitelist:**\n` +
          `- Estado: ${config.enabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
          `- Dominios: ${config.domains.length ? config.domains.join(", ") : "(vacio)"}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = await configStore.get(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
    );

    const nextDomains = new Set(
      (current.domains ?? []).map((d: string) => d.toLowerCase().trim()),
    );

    if (add) {
      const domain = add.toLowerCase().trim();
      if (!DOMAIN_PATTERN.test(domain)) {
        await ctx.write({
          content: "Dominio invalido. Usa formato como `github.com`.",
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
      domains: Array.from(nextDomains),
    };
    if (enabled !== undefined) updates.enabled = enabled;

    await configStore.set(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
      updates,
    );

    const updated = await configStore.get(
      guildId,
      ConfigurableModule.AutomodDomainWhitelist,
    );

    await ctx.write({
      content:
        `**AutoMod Domain Whitelist actualizado:**\n` +
        `- Estado: ${updated.enabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
        `- Dominios: ${updated.domains.length ? updated.domains.join(", ") : "(vacio)"}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
