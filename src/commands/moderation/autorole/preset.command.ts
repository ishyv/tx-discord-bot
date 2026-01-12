/**
 * Autorole Preset Command
 */
import type { GuildCommandContext } from "seyfert";
import {
  createRoleOption,
  Declare,
  Embed,
  Options,
  SubCommand,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import { applyReputationPreset } from "@/modules/autorole";
import {
  botCanManageRole,
  requireAutoroleContext,
} from "./shared";

const PRESET_RANKS = [
  { optionKey: "novatorole", label: "novato [1]", minRep: 0, slug: "rep-novato" },
  { optionKey: "iniciaterole", label: "iniciante [2]", minRep: 1, slug: "rep-iniciante" },
  { optionKey: "regularrole", label: "regular [3]", minRep: 16, slug: "rep-regular" },
  { optionKey: "avanzadorole", label: "avanzado [4]", minRep: 40, slug: "rep-avanzado" },
  { optionKey: "veteranorole", label: "veterano [5]", minRep: 80, slug: "rep-veterano" },
  { optionKey: "sabiorole", label: "sabio [6]", minRep: 100, slug: "rep-sabio" },
  { optionKey: "expertorole", label: "experto [7]", minRep: 150, slug: "rep-experto" },
] as const;

const options = {
  novatorole: createRoleOption({
    description: "Rol para novato [1]",
    required: true,
  }),
  iniciaterole: createRoleOption({
    description: "Rol para iniciante [2]",
    required: true,
  }),
  regularrole: createRoleOption({
    description: "Rol para regular [3]",
    required: true,
  }),
  avanzadorole: createRoleOption({
    description: "Rol para avanzado [4]",
    required: true,
  }),
  veteranorole: createRoleOption({
    description: "Rol para veterano [5]",
    required: true,
  }),
  sabiorole: createRoleOption({
    description: "Rol para sabio [6]",
    required: true,
  }),
  expertorole: createRoleOption({
    description: "Rol para experto [7]",
    required: true,
  }),
};

@Declare({
  name: "preset",
  description: "Configurar el preset de reputacion con roles especificos",
})
@Options(options)
export default class AutorolePresetCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const resolvedEntries: Array<{
      name: string;
      minRep: number;
      roleId: string;
      label: string;
    }> = [];

    for (const rank of PRESET_RANKS) {
      const role = ctx.options[rank.optionKey as keyof typeof options];
      if (!role) {
        await ctx.write({
          content: `Debes seleccionar el rol para ${rank.label}.`,
        });
        return;
      }

      const manageable = await botCanManageRole(ctx, role.id);
      if (!manageable) {
        await ctx.write({
          content: `No puedo administrar el rol ${role.name} (${rank.label}). Asegurate de que este debajo del rol del bot y que el bot tenga permisos.`,
        });
        return;
      }

      resolvedEntries.push({
        name: rank.slug,
        minRep: rank.minRep,
        roleId: role.id,
        label: rank.label,
      });
    }

    await applyReputationPreset(
      context.guildId,
      resolvedEntries.map((entry) => ({
        name: entry.name,
        minRep: entry.minRep,
        roleId: entry.roleId,
      })),
      ctx.author.id,
    );

    const embed = new Embed({
      title: "Preset de reputacion configurado",
      color: EmbedColors.Blue,
      description: resolvedEntries
        .map(
          (entry) =>
            `**${entry.label}** (rep >= ${entry.minRep}) -> <@&${entry.roleId}>`,
        )
        .join("\n"),
      footer: {
        text: "Los roles se asignaran automaticamente segun la reputacion.",
      },
    });

    await ctx.write({ embeds: [embed] });
  }
}
