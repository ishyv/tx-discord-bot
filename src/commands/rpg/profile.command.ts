/**
 * RPG Profile Subcommand.
 *
 * Purpose: Display RPG profile with loadout, stats, combat record, and HP.
 * Context: Shows character progression and equipment.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { rpgProfileService } from "@/modules/rpg/profile/service";
import { StatsCalculator } from "@/modules/rpg/stats/calculator";
import { getItemDefinition } from "@/modules/inventory/items";
import type { EquipmentSlot } from "@/db/schemas/rpg-profile";

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
  description: "Show your RPG profile with stats and equipment",
})
export default class RpgProfileSubcommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
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

      await ctx.write({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { profile, isNew } = ensureResult.unwrap();

    // Get stats
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

    // Add equipment info
    const equipmentLines = Object.entries(profile.loadout)
      .filter(([_, value]) => value !== null)
      .map(([slot, value]) => {
        const itemId = typeof value === "string" ? value : value!.itemId;
        const details = typeof value === "object" && value && "durability" in value ? ` (Dur: ${value.durability})` : "";
        return `${SLOT_EMOJIS[slot as EquipmentSlot]} **${slot.charAt(0).toUpperCase() + slot.slice(1)}:** ${getItemDefinition(itemId)?.name ?? itemId}${details}`;
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

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
