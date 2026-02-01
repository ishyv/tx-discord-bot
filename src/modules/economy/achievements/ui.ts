/**
 * Achievements UI Builders.
 *
 * Purpose: Build Discord embeds and components for achievement commands.
 * Context: Used by /achievements and /title commands.
 * Dependencies: Seyfert Embed, Achievement types.
 */

import { Embed } from "seyfert";
import type {
  AchievementBoardView,
  AchievementView,
  TitleView,
  AppliedAchievementReward,
} from "./types";
import { TIER_DISPLAY, CATEGORY_DISPLAY } from "./types";

/** Build achievement board embed. */
export function buildAchievementBoardEmbed(
  view: AchievementBoardView,
  username: string,
): Embed {
  const embed = new Embed()
    .setTitle(`🏆 Logros de ${username}`)
    .setDescription(
      `**${view.unlockedCount}/${view.totalCount}** logros desbloqueados\n` +
        `Progreso general: **${Math.round((view.unlockedCount / view.totalCount) * 100)}%**`,
    )
    .setColor(0xf1c40f)
    .setTimestamp();

  // Tier progress
  const tierLines: string[] = [];
  const tierOrder = [
    "bronze",
    "silver",
    "gold",
    "platinum",
    "diamond",
  ] as const;
  for (const tier of tierOrder) {
    const data = view.byTier[tier];
    if (data.total > 0) {
      const emoji = TIER_DISPLAY[tier].emoji;
      const name = TIER_DISPLAY[tier].name;
      tierLines.push(`${emoji} **${name}**: ${data.unlocked}/${data.total}`);
    }
  }

  if (tierLines.length > 0) {
    embed.addFields({
      name: "📊 Por Tier",
      value: tierLines.join("\n"),
      inline: true,
    });
  }

  // Category progress
  const categoryLines: string[] = [];
  for (const [cat, data] of Object.entries(view.byCategory)) {
    if (data.total > 0) {
      const emoji =
        CATEGORY_DISPLAY[cat as keyof typeof CATEGORY_DISPLAY].emoji;
      const name = CATEGORY_DISPLAY[cat as keyof typeof CATEGORY_DISPLAY].name;
      categoryLines.push(
        `${emoji} **${name}**: ${data.unlocked}/${data.total}`,
      );
    }
  }

  if (categoryLines.length > 0) {
    embed.addFields({
      name: "📁 Por Categoría",
      value: categoryLines.join("\n"),
      inline: true,
    });
  }

  // Next achievement to unlock
  if (view.nextAchievement && !view.nextAchievement.isUnlocked) {
    const next = view.nextAchievement;
    const progress = next.progress;
    const progressBar = progress
      ? buildProgressBar(progress.percent)
      : "🔒 Bloqueado";

    embed.addFields({
      name: "🎯 Próximo Logro",
      value: `${next.tierEmoji} **${next.name}**\n${progressBar} (${progress?.percent ?? 0}%)`,
      inline: false,
    });
  }

  // Recently unlocked
  if (view.recentlyUnlocked.length > 0) {
    const recentLines = view.recentlyUnlocked
      .slice(0, 5)
      .map((a) => `${a.tierEmoji} **${a.name}**`);

    embed.addFields({
      name: "🎉 Desbloqueados Recientemente",
      value: recentLines.join("\n"),
      inline: false,
    });
  }

  return embed;
}

/** Build achievement detail embed. */
export function buildAchievementDetailEmbed(
  achievement: AchievementView,
): Embed {
  const tierInfo = TIER_DISPLAY[achievement.tier];

  let description = achievement.description;

  // Add progress info if not unlocked
  if (!achievement.isUnlocked && achievement.progress) {
    const progressBar = buildProgressBar(achievement.progress.percent);
    description += `\n\n${progressBar} **${achievement.progress.current}/${achievement.progress.target}** (${achievement.progress.percent}%)`;
  }

  // Add rewards info
  if (achievement.rewards.length > 0) {
    const rewardLines = achievement.rewards.map((r) => {
      switch (r.type) {
        case "xp":
          return `✨ ${r.amount} XP`;
        case "currency":
          return `💰 ${r.amount} ${r.currencyId}`;
        case "title":
          return `🏷️ Título: "${r.titleName}"`;
        case "badge":
          return `${r.badgeEmoji} Insignia: ${r.badgeName}`;
        case "item":
          return `📦 ${r.quantity}x ${r.itemId}`;
        default:
          return "";
      }
    });
    description += `\n\n**Recompensas:**\n${rewardLines.join("\n")}`;
  }

  // Add status
  if (achievement.isUnlocked) {
    const claimStatus = achievement.rewardsClaimed
      ? "✅ Reclamado"
      : "🎁 ¡Listo para reclamar!";
    description += `\n\n**Estado:** ${claimStatus}`;
    if (achievement.unlockedAt) {
      const date = achievement.unlockedAt.toLocaleDateString("es-ES");
      description += `\n**Desbloqueado:** ${date}`;
    }
  } else {
    description += "\n\n**Estado:** 🔒 Bloqueado";
  }

  const embed = new Embed()
    .setTitle(`${tierInfo.emoji} ${achievement.name}`)
    .setDescription(description)
    .setColor(tierInfo.color)
    .setFooter({
      text: `Categoría: ${CATEGORY_DISPLAY[achievement.category].name}`,
    });

  return embed;
}

/** Build category achievements embed. */
export function buildCategoryAchievementsEmbed(
  category: string,
  achievements: AchievementView[],
): Embed {
  const catInfo = CATEGORY_DISPLAY[category as keyof typeof CATEGORY_DISPLAY];
  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;

  const lines: string[] = [];
  for (const achievement of achievements) {
    const status = achievement.isUnlocked ? "✅" : "🔒";
    const progress =
      !achievement.isUnlocked && achievement.progress
        ? ` (${achievement.progress.percent}%)`
        : "";
    lines.push(
      `${status} ${achievement.tierEmoji} **${achievement.name}**${progress}`,
    );
  }

  const embed = new Embed()
    .setTitle(`${catInfo.emoji} Logros de ${catInfo.name}`)
    .setDescription(
      `**${unlockedCount}/${achievements.length}** desbloqueados\n\n${lines.join("\n")}`,
    )
    .setColor(0x3498db);

  return embed;
}

/** Build titles list embed. */
export function buildTitlesEmbed(titles: TitleView[], username: string): Embed {
  const equipped = titles.find((t) => t.isEquipped);

  const lines: string[] = [];
  for (const title of titles) {
    const status = title.isEquipped ? "✅" : "🔹";
    let display = title.name;
    if (title.prefix) display = `${title.prefix}${display}`;
    if (title.suffix) display = `${display}${title.suffix}`;
    lines.push(`${status} **${display}**`);
  }

  let description = `Tienes **${titles.length}** títulos desbloqueados.`;
  if (equipped) {
    description += `\nTítulo actual: **${equipped.name}**`;
  }
  description +=
    "\n\n" + (lines.length > 0 ? lines.join("\n") : "*No tienes títulos aún*");

  const embed = new Embed()
    .setTitle(`🏷️ Títulos de ${username}`)
    .setDescription(description)
    .setColor(0x9b59b6);

  return embed;
}

/** Build title equipped embed. */
export function buildTitleEquippedEmbed(title: TitleView): Embed {
  let display = title.name;
  if (title.prefix) display = `${title.prefix}${display}`;
  if (title.suffix) display = `${display}${title.suffix}`;

  const embed = new Embed()
    .setTitle("🏷️ Título Equipado")
    .setDescription(`Ahora llevas el título: **${display}**`)
    .setColor(0x2ecc71);

  return embed;
}

/** Build reward claim embed. */
export function buildRewardClaimEmbed(
  achievementName: string,
  rewards: AppliedAchievementReward[],
): Embed {
  const rewardLines = rewards.map((r) => {
    if (r.amount !== undefined) {
      return `• **${r.description}**`;
    }
    return `• ${r.description}`;
  });

  const embed = new Embed()
    .setTitle("🎉 Recompensas Reclamadas")
    .setDescription(
      `Logro: **${achievementName}**\n\n**Recompensas obtenidas:**\n${rewardLines.join("\n")}`,
    )
    .setColor(0x2ecc71);

  return embed;
}

/** Build error embed. */
export function buildAchievementErrorEmbed(message: string): Embed {
  return new Embed()
    .setTitle("❌ Error")
    .setDescription(message)
    .setColor(0xe74c3c);
}

/** Build success embed. */
export function buildAchievementSuccessEmbed(
  title: string,
  message: string,
): Embed {
  return new Embed()
    .setTitle(`✅ ${title}`)
    .setDescription(message)
    .setColor(0x2ecc71);
}

/** Build progress bar. */
function buildProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/** Build achievement unlocked notification embed. */
export function buildAchievementUnlockedEmbed(
  achievement: AchievementView,
): Embed {
  const tierInfo = TIER_DISPLAY[achievement.tier];

  const embed = new Embed()
    .setTitle(`${tierInfo.emoji} ¡Logro Desbloqueado!`)
    .setDescription(
      `**${achievement.name}**\n\n${achievement.description}\n\n` +
        `Usa \`/achievements\` para ver tu progreso o \`/achievements claim ${achievement.id}\` para reclamar recompensas.`,
    )
    .setColor(tierInfo.color)
    .setTimestamp();

  return embed;
}

/** Build badge slots embed. */
export function buildBadgeSlotsEmbed(
  badges: (import("./types").UserBadge | null)[],
  username: string,
): Embed {
  const lines: string[] = [];

  for (let i = 0; i < 3; i++) {
    const badge = badges[i];
    const slotNum = i + 1;
    if (badge) {
      lines.push(`**Slot ${slotNum}:** ${badge.emoji} ${badge.name}`);
    } else {
      lines.push(`**Slot ${slotNum}:** *Vacío*`);
    }
  }

  const embed = new Embed()
    .setTitle(`🎖️ Insignias de ${username}`)
    .setDescription(lines.join("\n"))
    .setColor(0xf39c12);

  return embed;
}
