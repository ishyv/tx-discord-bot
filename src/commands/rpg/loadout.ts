/**
 * Loadout Command.
 *
 * Purpose: View your current equipment and loadout with stat totals.
 * Context: Shows equipped items and calculated stats.
 */
import {
  Declare,
  Options,
  Command,
  type GuildCommandContext,
  createUserOption,
  Embed,
} from "seyfert";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { getItemDefinition } from "@/modules/inventory/items";
import { EQUIPMENT_SLOTS } from "@/modules/rpg/config";
import { getContextInfo, replyEphemeral } from "@/adapters/seyfert";
import type { EquipmentSlot } from "@/db/schemas/rpg-profile";

const options = {
  user: createUserOption({
    description: "User to view loadout of (default: yourself)",
    required: false,
  }),
};

@Declare({
  name: "loadout",
  description: "View your RPG equipment loadout",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
@Options(options)
export default class LoadoutCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { userId, username } = getContextInfo(ctx);
    const viewUserId = ctx.options.user?.id ?? userId;

    const profileResult = await rpgProfileRepo.findById(viewUserId);

    if (profileResult.isErr() || !profileResult.unwrap()) {
      if (viewUserId === userId) {
        await replyEphemeral(ctx, {
          content: "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
        });
      } else {
        await replyEphemeral(ctx, {
          content: "❌ That user doesn't have an RPG profile.",
        });
      }
      return;
    }

    const profile = profileResult.unwrap()!;
    const viewName = viewUserId === userId ? username : (ctx.options.user?.username ?? "Unknown");

    // Calculate total stats from equipment
    const totals = { hp: 0, atk: 0, def: 0 };
    const equippedItems: Array<{ slot: EquipmentSlot; itemId: string }> = [];

    for (const slot of EQUIPMENT_SLOTS) {
      const equipped = profile.loadout[slot];
      if (equipped) {
        const itemId = typeof equipped === "string" ? equipped : equipped.itemId;
        equippedItems.push({ slot, itemId });
        const def = getItemDefinition(itemId);
        if (def?.stats) {
          totals.hp += def.stats.hp ?? 0;
          totals.atk += def.stats.atk ?? 0;
          totals.def += def.stats.def ?? 0;
        }
      }
    }

    // Add base HP from profile
    totals.hp += profile.hpCurrent;

    // Build embed
    const embed = new Embed()
      .setTitle(`👤 ${viewName}'s Loadout`)
      .setColor(0x3498db);

    // Equipment section
    if (equippedItems.length === 0) {
      embed.setDescription("*No items equipped*");
    } else {
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

      let equipmentText = "";
      for (const { slot, itemId } of equippedItems) {
        const def = getItemDefinition(itemId);
        const emoji = def?.emoji ?? "📦";
        const name = def?.name ?? itemId;

        // Get item stats
        const itemStats: string[] = [];
        if (def?.stats) {
          if (def.stats.atk) itemStats.push(`ATK +${def.stats.atk}`);
          if (def.stats.def) itemStats.push(`DEF +${def.stats.def}`);
          if (def.stats.hp) itemStats.push(`HP +${def.stats.hp}`);
        }

        const statsText = itemStats.length > 0 ? ` (${itemStats.join(", ")})` : "";
        equipmentText += `${SLOT_EMOJIS[slot]} **${slot.charAt(0).toUpperCase() + slot.slice(1)}:** ${emoji} ${name}${statsText}\n`;
      }

      embed.addFields({ name: "Equipped Items", value: equipmentText });
    }

    // Stats section
    const statsText = `❤️ HP: ${totals.hp}\n⚔️ ATK: ${totals.atk}\n🛡️ DEF: ${totals.def}`;
    embed.addFields({ name: "📊 Total Stats", value: statsText, inline: false });

    // Combat record
    const totalFights = profile.wins + profile.losses;
    const winRate = totalFights > 0 ? Math.round((profile.wins / totalFights) * 100) : 0;
    embed.addFields(
      { name: "Combat Record", value: `🏆 ${profile.wins}W / ${profile.losses}L (${winRate}%)`, inline: true },
      { name: "HP Current", value: `${profile.hpCurrent}`, inline: true },
    );

    // Combat status
    if (profile.isFighting) {
      embed.setFooter({ text: "⚔️ Currently in combat" });
    }

    await ctx.write({ embeds: [embed], flags: 64 });
  }
}
