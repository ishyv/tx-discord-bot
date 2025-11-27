/**
 * Motivación: registrar el comando "moderation / dashboard" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import {
  Command,
  createBooleanOption,
  createStringOption,
  Declare,
  Embed,
  GuildCommandContext,
  Options,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import {
  getFeatureFlags,
  GUILD_FEATURES,
  setFeatureFlag,
  setAllFeatureFlags,
} from "@/modules/features";
import {
  autoRoleFetchRulesByGuild,
  disableRule,
  refreshGuildRules,
} from "@/db/repositories";
import { requireGuildId, requireGuildPermission } from "@/utils/commandGuards";

const featureChoices = GUILD_FEATURES.map((feature) => ({
  name: feature,
  value: feature,
}));

const options = {
  feature: createStringOption({
    description: "Feature a habilitar/deshabilitar",
    required: false,
    choices: featureChoices,
  }),
  enabled: createBooleanOption({
    description: "true = habilitar, false = deshabilitar",
    required: false,
  }),
  enable_all: createBooleanOption({
    description: "Habilita todas las features",
    required: false,
  }),
  disable_all: createBooleanOption({
    description: "Deshabilita todas las features",
    required: false,
  }),
};

@Declare({
  name: "features",
  description: "Habilita o deshabilita las features principales del bot",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@Options(options)
export default class FeatureDashboardCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = await requireGuildId(ctx);
    if (!guildId) return;

    const allowed = await requireGuildPermission(ctx, {
      guildId,
      permissions: ["ManageGuild"],
    });
    if (!allowed) return;

    const feature = ctx.options.feature;
    const enabledInput = ctx.options.enabled;
    const enableAll = ctx.options.enable_all === true;
    const disableAll = ctx.options.disable_all === true;

    if (enableAll && disableAll) {
      await ctx.write({
        content: "No puedes habilitar y deshabilitar todo al mismo tiempo.",
      });
      return;
    }

    if (enableAll || disableAll) {
      const value = enableAll && !disableAll;
      const updated = await setAllFeatureFlags(guildId, value);
      if (disableAll) {
        await this.applySideEffects(ctx, guildId, "autoroles", false);
      }

      const embed = new Embed({
        title: value ? "Todas las features habilitadas" : "Todas las features deshabilitadas",
        color: value ? EmbedColors.Green : EmbedColors.Red,
        fields: GUILD_FEATURES.map((f) => ({
          name: f,
          value: updated[f] ? "✅ Activado" : "⛔ Desactivado",
          inline: true,
        })),
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    if (!feature || enabledInput === undefined) {
      const features = await getFeatureFlags(guildId);
      const embed = new Embed({
        title: "Dashboard de features",
        color: EmbedColors.Blurple,
        description:
          "Resumen del estado actual de cada sistema. Usa `/dashboard feature:<nombre> enabled:<true|false>` para actualizar.",
        fields: GUILD_FEATURES.map((f) => ({
          name: f,
          value: features[f] ? "✅ Activado" : "⛔ Desactivado",
          inline: true,
        })),
      });
      await ctx.write({ embeds: [embed] });
      return;
    }

    const updated = await setFeatureFlag(guildId, feature, enabledInput);
    await this.applySideEffects(ctx, guildId, feature, enabledInput);

    const embed = new Embed({
      title: "Feature actualizada",
      color: enabledInput ? EmbedColors.Green : EmbedColors.Red,
      description: `\`${feature}\` ahora está ${enabledInput ? "habilitada" : "deshabilitada"}.`,
      fields: GUILD_FEATURES.map((f) => ({
        name: f,
        value: updated[f] ? "✅ Activado" : "⛔ Desactivado",
        inline: true,
      })),
    });
    await ctx.write({ embeds: [embed] });
  }

  /**
   * Side-effects when toggling features:
   * - autoroles: disabling turns off all rules and refreshes cache.
   */
  private async applySideEffects(
    ctx: GuildCommandContext<typeof options>,
    guildId: string,
    feature: string,
    enabled: boolean,
  ) {
    if (feature !== "autoroles" || enabled) return;

    try {
      const rules = await autoRoleFetchRulesByGuild(guildId);
      const enabledRules = rules.filter((rule) => rule.enabled);
      if (enabledRules.length === 0) return;

      for (const rule of enabledRules) {
        await disableRule(guildId, rule.name);
      }
      await refreshGuildRules(guildId);
      ctx.client.logger?.info?.("[dashboard] autoroles deshabilitado: reglas apagadas", {
        guildId,
        disabledRules: enabledRules.length,
      });
    } catch (error) {
      ctx.client.logger?.error?.("[dashboard] no se pudieron deshabilitar reglas de autoroles", {
        guildId,
        error,
      });
    }
  }
}
