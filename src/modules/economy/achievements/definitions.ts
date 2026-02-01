/**
 * Achievement Definitions Registry.
 *
 * Purpose: Define all available achievements with their unlock conditions and rewards.
 * Context: Static registry of achievement definitions.
 * Dependencies: Achievement types.
 *
 * Invariants:
 * - All achievement IDs are unique.
 * - Rewards are capped to prevent economy abuse.
 * - Tiers follow a logical progression.
 */

import type { AchievementDefinition } from "./types";

/**
 * Achievement definitions registry.
 * 16 achievements across 6 categories with increasing difficulty.
 */
export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  // ============================================================================
  // PROGRESSION - Streak & Level Milestones
  // ============================================================================

  {
    id: "streak_7",
    name: "Constancia",
    description: "Mantén una racha de 7 días reclamando tu recompensa diaria.",
    tier: "bronze",
    category: "progression",
    condition: { type: "streak_milestone", days: 7 },
    rewards: [
      { type: "xp", amount: 100 },
      { type: "currency", currencyId: "coins", amount: 500 },
    ],
    title: {
      type: "title",
      titleId: "title_constant",
      titleName: "Constante",
      titlePrefix: "[Constante] ",
    },
    displayOrder: 1,
  },

  {
    id: "streak_14",
    name: "Dedicación",
    description: "Mantén una racha de 14 días reclamando tu recompensa diaria.",
    tier: "silver",
    category: "progression",
    condition: { type: "streak_milestone", days: 14 },
    rewards: [
      { type: "xp", amount: 250 },
      { type: "currency", currencyId: "coins", amount: 1000 },
    ],
    title: {
      type: "title",
      titleId: "title_dedicated",
      titleName: "Dedicado",
      titlePrefix: "[Dedicado] ",
    },
    displayOrder: 2,
  },

  {
    id: "streak_30",
    name: "Leyenda de la Constancia",
    description:
      "Mantén una racha de 30 días reclamando tu recompensa diaria. ¡Eres una leyenda!",
    tier: "gold",
    category: "progression",
    condition: { type: "streak_milestone", days: 30 },
    rewards: [
      { type: "xp", amount: 500 },
      { type: "currency", currencyId: "coins", amount: 2500 },
      {
        type: "badge",
        badgeId: "badge_streak",
        badgeEmoji: "🔥",
        badgeName: "Racha Inquebrantable",
      },
    ],
    title: {
      type: "title",
      titleId: "title_legend",
      titleName: "Leyenda",
      titlePrefix: "[🔥 Leyenda] ",
    },
    displayOrder: 3,
  },

  {
    id: "level_3",
    name: "Primeros Pasos",
    description: "Alcanza el nivel 3 en el sistema de progresión.",
    tier: "bronze",
    category: "progression",
    condition: { type: "level_milestone", level: 3 },
    rewards: [
      { type: "xp", amount: 100 },
      { type: "currency", currencyId: "coins", amount: 300 },
    ],
    displayOrder: 4,
  },

  {
    id: "level_6",
    name: "En Ascenso",
    description: "Alcanza el nivel 6 en el sistema de progresión.",
    tier: "silver",
    category: "progression",
    condition: { type: "level_milestone", level: 6 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 600 },
    ],
    title: {
      type: "title",
      titleId: "title_rising",
      titleName: "Ascendente",
      titleSuffix: " el Ascendente",
    },
    displayOrder: 5,
  },

  {
    id: "level_9",
    name: "Veterano",
    description: "Alcanza el nivel 9 en el sistema de progresión.",
    tier: "gold",
    category: "progression",
    condition: { type: "level_milestone", level: 9 },
    rewards: [
      { type: "xp", amount: 350 },
      { type: "currency", currencyId: "coins", amount: 1200 },
    ],
    title: {
      type: "title",
      titleId: "title_veteran",
      titleName: "Veterano",
      titlePrefix: "[Veterano] ",
    },
    displayOrder: 6,
  },

  {
    id: "level_12",
    name: "Maestro",
    description:
      "Alcanza el nivel 12 en el sistema de progresión. ¡La cima está cerca!",
    tier: "platinum",
    category: "progression",
    condition: { type: "level_milestone", level: 12 },
    rewards: [
      { type: "xp", amount: 500 },
      { type: "currency", currencyId: "coins", amount: 2000 },
      {
        type: "badge",
        badgeId: "badge_master",
        badgeEmoji: "👑",
        badgeName: "Maestro",
      },
    ],
    title: {
      type: "title",
      titleId: "title_master",
      titleName: "Maestro",
      titlePrefix: "[👑 Maestro] ",
    },
    displayOrder: 7,
  },

  // ============================================================================
  // CRAFTING
  // ============================================================================

  {
    id: "craft_10",
    name: "Artesano Principiante",
    description: "Craftea 10 recetas exitosamente.",
    tier: "bronze",
    category: "crafting",
    condition: { type: "craft_count", count: 10 },
    rewards: [
      { type: "xp", amount: 150 },
      { type: "currency", currencyId: "coins", amount: 500 },
    ],
    title: {
      type: "title",
      titleId: "title_crafter",
      titleName: "Artesano",
      titleSuffix: " el Artesano",
    },
    displayOrder: 8,
  },

  {
    id: "craft_50",
    name: "Maestro Artesano",
    description:
      "Craftea 50 recetas exitosamente. ¡Tus manos crean maravillas!",
    tier: "gold",
    category: "crafting",
    condition: { type: "craft_count", count: 50 },
    rewards: [
      { type: "xp", amount: 400 },
      { type: "currency", currencyId: "coins", amount: 2000 },
      {
        type: "badge",
        badgeId: "badge_crafter",
        badgeEmoji: "⚒️",
        badgeName: "Maestro Artesano",
      },
    ],
    title: {
      type: "title",
      titleId: "title_master_crafter",
      titleName: "Maestro Artesano",
      titlePrefix: "[⚒️ Maestro] ",
    },
    displayOrder: 9,
  },

  // ============================================================================
  // MINIGAMES
  // ============================================================================

  {
    id: "trivia_wins_10",
    name: "Mente Brillante",
    description: "Gana 10 partidas de trivia correctamente.",
    tier: "silver",
    category: "minigame",
    condition: { type: "trivia_wins", count: 10 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 800 },
    ],
    title: {
      type: "title",
      titleId: "title_brain",
      titleName: "Mente Brillante",
      titleSuffix: " el Sabio",
    },
    displayOrder: 10,
  },

  {
    id: "trivia_wins_50",
    name: "Genio Trivial",
    description: "Gana 50 partidas de trivia. ¡Eres un pozo de conocimiento!",
    tier: "platinum",
    category: "minigame",
    condition: { type: "trivia_wins", count: 50 },
    rewards: [
      { type: "xp", amount: 500 },
      { type: "currency", currencyId: "coins", amount: 2500 },
      {
        type: "badge",
        badgeId: "badge_genius",
        badgeEmoji: "🧠",
        badgeName: "Genio",
      },
    ],
    title: {
      type: "title",
      titleId: "title_genius",
      titleName: "Genio",
      titlePrefix: "[🧠 Genio] ",
    },
    displayOrder: 11,
  },

  {
    id: "coinflip_streak_5",
    name: "Suerte del Principiante",
    description: "Gana 5 veces seguidas en coinflip.",
    tier: "silver",
    category: "minigame",
    condition: { type: "coinflip_streak", consecutiveWins: 5 },
    rewards: [
      { type: "xp", amount: 250 },
      { type: "currency", currencyId: "coins", amount: 1000 },
    ],
    displayOrder: 12,
  },

  // ============================================================================
  // SOCIAL - Robin Hood
  // ============================================================================

  {
    id: "rob_total_5000",
    name: "Robin Hood",
    description:
      "Acumula 5000 monedas robadas exitosamente (en cualquier cantidad de intentos).",
    tier: "gold",
    category: "social",
    condition: { type: "rob_success", totalAmount: 5000 },
    rewards: [
      { type: "xp", amount: 300 },
      { type: "currency", currencyId: "coins", amount: 1500 },
      {
        type: "badge",
        badgeId: "badge_robin",
        badgeEmoji: "🏹",
        badgeName: "Robin Hood",
      },
    ],
    title: {
      type: "title",
      titleId: "title_robin",
      titleName: "Robin Hood",
      titlePrefix: "[🏹 Robin Hood] ",
    },
    displayOrder: 13,
  },

  // ============================================================================
  // COLLECTION
  // ============================================================================

  {
    id: "store_purchases_20",
    name: "Cliente Frecuente",
    description: "Realiza 20 compras exitosas en la tienda.",
    tier: "silver",
    category: "collection",
    condition: { type: "store_purchases", count: 20 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 1000 },
    ],
    title: {
      type: "title",
      titleId: "title_shopper",
      titleName: "Comprador",
      titleSuffix: " el Comprador",
    },
    displayOrder: 14,
  },

  {
    id: "items_collected_25",
    name: "Coleccionista",
    description: "Obtén 25 items únicos diferentes en tu inventario.",
    tier: "gold",
    category: "collection",
    condition: { type: "items_collected", uniqueItems: 25 },
    rewards: [
      { type: "xp", amount: 350 },
      { type: "currency", currencyId: "coins", amount: 1500 },
      {
        type: "badge",
        badgeId: "badge_collector",
        badgeEmoji: "🎒",
        badgeName: "Coleccionista",
      },
    ],
    title: {
      type: "title",
      titleId: "title_collector",
      titleName: "Coleccionista",
      titlePrefix: "[🎒 Coleccionista] ",
    },
    displayOrder: 15,
  },

  // ============================================================================
  // SPECIAL
  // ============================================================================

  {
    id: "quest_completions_10",
    name: "Cazador de Misiones",
    description: "Completa 10 misiones del tablón de misiones.",
    tier: "silver",
    category: "special",
    condition: { type: "quest_completions", count: 10 },
    rewards: [
      { type: "xp", amount: 250 },
      { type: "currency", currencyId: "quest_tokens", amount: 5 },
    ],
    title: {
      type: "title",
      titleId: "title_hunter",
      titleName: "Cazador",
      titleSuffix: " el Cazador",
    },
    displayOrder: 16,
  },

  {
    id: "votes_cast_50",
    name: "Jurado Popular",
    description: "Emite 50 votos usando el sistema de votación.",
    tier: "silver",
    category: "social",
    condition: { type: "votes_cast", count: 50 },
    rewards: [
      { type: "xp", amount: 200 },
      { type: "currency", currencyId: "coins", amount: 1000 },
      {
        type: "badge",
        badgeId: "badge_voter",
        badgeEmoji: "🗳️",
        badgeName: "Votante",
      },
    ],
    displayOrder: 17,
  },
] as const;

/** Achievement definitions map by ID. */
export const ACHIEVEMENT_MAP: ReadonlyMap<string, AchievementDefinition> =
  new Map(ACHIEVEMENT_DEFINITIONS.map((a) => [a.id, a]));

/**
 * Get achievement definition by ID.
 */
export function getAchievementDefinition(
  id: string,
): AchievementDefinition | undefined {
  return ACHIEVEMENT_MAP.get(id);
}

/**
 * Get all achievement definitions.
 */
export function getAllAchievementDefinitions(): readonly AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS;
}

/**
 * Get achievements by category.
 */
export function getAchievementsByCategory(
  category: AchievementDefinition["category"],
): readonly AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((a) => a.category === category);
}

/**
 * Get achievements by tier.
 */
export function getAchievementsByTier(
  tier: AchievementDefinition["tier"],
): readonly AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((a) => a.tier === tier);
}
