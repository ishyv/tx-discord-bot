/**
 * Autorole Preset Command
 */
import type { GuildCommandContext } from "seyfert";
import { createRoleOption, Declare, Embed, Options, SubCommand } from "seyfert";
import { UIColors } from "@/modules/ui/design-system";
import { HelpDoc, HelpCategory } from "@/modules/help";

import { applyReputationPreset } from "@/modules/autorole";
import { botCanManageRole, requireAutoroleContext } from "./shared";

const PRESET_RANKS = [
  {
    optionKey: "novice_role",
    label: "Novice [1]",
    minRep: 0,
    slug: "rep-novice",
  },
  {
    optionKey: "initiate_role",
    label: "Initiate [2]",
    minRep: 1,
    slug: "rep-initiate",
  },
  {
    optionKey: "regular_role",
    label: "Regular [3]",
    minRep: 16,
    slug: "rep-regular",
  },
  {
    optionKey: "advanced_role",
    label: "Advanced [4]",
    minRep: 40,
    slug: "rep-advanced",
  },
  {
    optionKey: "veteran_role",
    label: "Veteran [5]",
    minRep: 80,
    slug: "rep-veteran",
  },
  {
    optionKey: "sage_role",
    label: "Sage [6]",
    minRep: 100,
    slug: "rep-sage",
  },
  {
    optionKey: "expert_role",
    label: "Expert [7]",
    minRep: 150,
    slug: "rep-expert",
  },
] as const;

const options = {
  novice_role: createRoleOption({
    description: "Role for Novice [1]",
    required: true,
  }),
  initiate_role: createRoleOption({
    description: "Role for Initiate [2]",
    required: true,
  }),
  regular_role: createRoleOption({
    description: "Role for Regular [3]",
    required: true,
  }),
  advanced_role: createRoleOption({
    description: "Role for Advanced [4]",
    required: true,
  }),
  veteran_role: createRoleOption({
    description: "Role for Veteran [5]",
    required: true,
  }),
  sage_role: createRoleOption({
    description: "Role for Sage [6]",
    required: true,
  }),
  expert_role: createRoleOption({
    description: "Role for Expert [7]",
    required: true,
  }),
};

@HelpDoc({
  command: "autorole preset",
  category: HelpCategory.Moderation,
  description: "Configure the reputation rank preset by assigning roles to each rank tier",
  usage: "/autorole preset [novice_role] [apprentice_role] ...",
  permissions: ["ManageRoles"],
})
@Declare({
  name: "preset",
  description: "Configure the reputation preset with specific roles",
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
          content: `You must select a role for ${rank.label}.`,
        });
        return;
      }

      const manageable = await botCanManageRole(ctx, role.id);
      if (!manageable) {
        await ctx.write({
          content: `I cannot manage the role ${role.name} (${rank.label}). Make sure it is below the bot's role and that the bot has permissions.`,
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
      title: "Reputation preset configured",
      color: UIColors.info,
      description: resolvedEntries
        .map(
          (entry) =>
            `**${entry.label}** (rep >= ${entry.minRep}) -> <@&${entry.roleId}>`,
        )
        .join("\n"),
      footer: {
        text: "Roles will be automatically assigned based on reputation.",
      },
    });

    await ctx.write({ embeds: [embed] });
  }
}
