/**
 * RPG Profile Subcommand.
 *
 * Purpose: Display RPG profile with loadout, stats, combat record, and HP.
 * Context: Shows character progression and equipment.
 *          Triggers onboarding flow for new users without a starter kit.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import { StatsCalculator } from "@/modules/rpg/stats/calculator";
import { getItemDefinition, getToolMaxDurability } from "@/modules/inventory/items";
import type { EquipmentSlot } from "@/db/schemas/rpg-profile";
import { onboardingService } from "@/modules/rpg/onboarding/service";
import { rpgConfigService } from "@/modules/rpg/config/service";
import { DEFAULT_ONBOARDING_CONFIG } from "@/modules/rpg/config/defaults";
import { renderProgressBar } from "@/modules/economy/account/formatting";
import {
  createOnboardingEmbed,
  createOnboardingButtons,
} from "@/modules/rpg/onboarding/views";

const SLOT_EMOJIS: Record<EquipmentSlot, string> = {
  weapon: "⚔️",
  shield: "🛡️",
  helmet: "⛑️",
  chest: "👕",
  pants: "👖",
  boots: "👢",
  ring: "💍",
  necklace: "📿",
};

@Declare({
  name: "profile",
  description: "🎮 Show your RPG profile (stats, equipment, combat record). For economy profile use /profile",
})
export default class RpgProfileSubcommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    await ctx.deferReply(true);
    const userId = ctx.author.id;
    const guildId = ctx.guildId ?? undefined;

    // Ensure profile and check economy gate
    const ensureResult = await rpgProfileService.ensureAndGate(userId, guildId);
    if (ensureResult.isErr()) {
      const error = ensureResult.error as { code?: string; message: string };
      let message = "❌ ";

      switch (error.code) {
        case "ACCOUNT_BLOCKED":
          message += "Your economy account is blocked. RPG access restricted.";
          break;
        case "ACCOUNT_BANNED":
          message += "Your economy account is banned. RPG access denied.";
          break;
        default:
          message += error.message;
      }

      await ctx.editOrReply({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { profile, isNew } = ensureResult.unwrap();

    // Check if user needs onboarding (new user without starter kit)
    if (guildId) {
      const statusResult = await onboardingService.checkStatus(userId, guildId);
      if (statusResult.isOk() && statusResult.unwrap().needsOnboarding) {
        // Show onboarding flow with path selection
        const configResult = await rpgConfigService.getConfig(guildId);
        const onboardingConfig =
          configResult.isOk() && configResult.unwrap().onboarding
            ? configResult.unwrap().onboarding!
            : DEFAULT_ONBOARDING_CONFIG;

        const embed = createOnboardingEmbed(
          ctx.author.username,
          onboardingConfig.starterKits.miner,
          onboardingConfig.starterKits.lumber,
        );

        const buttons = createOnboardingButtons();

        await ctx.editOrReply({
          embeds: [embed],
          components: [buttons],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Get stats
    const stats = StatsCalculator.calcStats(
      profile.loadout,
      (id) => {
        const def = getItemDefinition(id);
        return def?.stats
          ? { id, atk: def.stats.atk, def: def.stats.def, hp: def.stats.hp }
          : null;
      },
    );

    // Build embed
    const embed = new Embed()
      .setTitle(`🎮 RPG Profile: ${ctx.author.username}`)
      .setDescription(isNew ? "✨ Profile created!" : `Created: <t:${Math.floor(profile.createdAt.getTime() / 1000)}:R>`)
      .setColor(profile.isFighting ? 0xff0000 : 0x00ff00)
      .addFields(
        {
          name: "📊 Stats",
          value: `⚔️ **ATK:** ${stats.atk}\n🛡️ **DEF:** ${stats.def}\n❤️ **HP:** ${stats.maxHp} (${profile.hpCurrent}/${stats.maxHp})`,
          inline: true,
        },
        {
          name: "🏆 Record",
          value: `✅ Wins: ${profile.wins}\n❌ Losses: ${profile.losses}\n📈 Win Rate: ${profile.wins + profile.losses > 0 ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : 0}%`,
          inline: true,
        },
      );

    // Show starter kit path if claimed
    if (profile.starterKitType) {
      const pathEmoji = profile.starterKitType === "miner" ? "⛏️" : "🪓";
      const pathName = profile.starterKitType === "miner" ? "Miner" : "Lumber";
      embed.addFields({
        name: "🎯 Path",
        value: `${pathEmoji} **${pathName}**`,
        inline: true,
      });
    }

    // Add equipment info
    const equipmentLines = Object.entries(profile.loadout)
      .filter(([_, value]) => value !== null)
      .map(([slot, value]) => {
        const itemId = typeof value === "string" ? value : value!.itemId;
        let details = "";

        if (typeof value === "object" && value && "durability" in value) {
          const def = getItemDefinition(itemId);
          const max = (def && getToolMaxDurability(def)) || 100;
          const percent = (value.durability / max) * 100;
          const bar = renderProgressBar(percent, 5);
          details = ` ${bar} \`${value.durability}\``;
        }

        const def = getItemDefinition(itemId);
        const name = def?.name ?? itemId;
        return `${SLOT_EMOJIS[slot as EquipmentSlot]} **${slot.charAt(0).toUpperCase() + slot.slice(1)}:** ${name}${details}`;
      });

    embed.addFields({
      name: "🎒 Equipment",
      value: equipmentLines.length > 0 ? equipmentLines.join("\n") : "*No equipment*",
      inline: false,
    });

    if (profile.isFighting) {
      embed.addFields({
        name: "⚔️ Status",
        value: "🔴 **In Combat**",
        inline: false,
      });
    }

    await ctx.editOrReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
