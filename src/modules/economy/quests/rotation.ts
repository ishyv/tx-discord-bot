/**
 * Quest Rotation Service.
 *
 * Purpose: Generate daily and weekly quest rotations with featured quest selection.
 * Context: Runs on schedule or when requested. Ensures variety and balance.
 * Dependencies: QuestRepository, QuestTemplate.
 */

import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { questRepo } from "./repository";
import type {
  QuestTemplate,
  QuestRotation,
  QuestRotationConfig,
  QuestDifficulty,
  QuestError,
  CreateQuestTemplateInput,
} from "./types";
import { QuestError as QuestErrorImpl } from "./types";

/** Service interface for quest rotation management. */
export interface QuestRotationService {
  /** Generate a new daily rotation for a guild. */
  generateDailyRotation(
    guildId: GuildId,
  ): Promise<Result<QuestRotation, QuestError>>;

  /** Generate a new weekly rotation for a guild. */
  generateWeeklyRotation(
    guildId: GuildId,
  ): Promise<Result<QuestRotation, QuestError>>;

  /** Check and regenerate rotations if needed. */
  ensureCurrentRotations(
    guildId: GuildId,
  ): Promise<Result<RotationStatus, QuestError>>;

  /** Force refresh a rotation. */
  refreshRotation(
    guildId: GuildId,
    type: "daily" | "weekly",
  ): Promise<Result<QuestRotation, QuestError>>;

  /** Get rotation schedule info. */
  getScheduleInfo(guildId: GuildId): Promise<Result<ScheduleInfo, QuestError>>;
}

/** Rotation status summary. */
export interface RotationStatus {
  readonly dailyActive: boolean;
  readonly dailyExpiresAt: Date | null;
  readonly weeklyActive: boolean;
  readonly weeklyExpiresAt: Date | null;
  readonly featuredActive: boolean;
  readonly generated: boolean;
}

/** Schedule information. */
export interface ScheduleInfo {
  readonly dailyReset: Date;
  readonly weeklyReset: Date;
  readonly config: QuestRotationConfig;
  readonly timezone: string;
}

/** Difficulty weights for balanced selection. */
const DIFFICULTY_WEIGHTS: Record<QuestDifficulty, number> = {
  easy: 3,
  medium: 2,
  hard: 1,
  expert: 0.5,
  legendary: 0.25,
};

/** Calculate next daily reset time. */
function getNextDailyReset(
  config: QuestRotationConfig,
  from: Date = new Date(),
): Date {
  const reset = new Date(from);
  reset.setUTCHours(config.dailyResetHour, 0, 0, 0);

  if (reset <= from) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }

  return reset;
}

/** Calculate next weekly reset time. */
function getNextWeeklyReset(
  config: QuestRotationConfig,
  from: Date = new Date(),
): Date {
  const reset = new Date(from);
  reset.setUTCHours(config.weeklyResetHour, 0, 0, 0);

  // Adjust to the configured day (0 = Sunday, 1 = Monday, etc.)
  const currentDay = reset.getUTCDay();
  const daysUntilReset = (config.weeklyResetDay - currentDay + 7) % 7;

  if (daysUntilReset === 0 && reset <= from) {
    reset.setUTCDate(reset.getUTCDate() + 7);
  } else {
    reset.setUTCDate(reset.getUTCDate() + daysUntilReset);
  }

  return reset;
}

/** Select quests with balanced difficulty distribution. */
function selectBalancedQuests(
  templates: QuestTemplate[],
  count: number,
  excludeIds: string[] = [],
): string[] {
  // Filter enabled and not excluded
  const available = templates.filter(
    (t) => t.enabled && !excludeIds.includes(t.id),
  );

  if (available.length === 0) return [];
  if (available.length <= count) return available.map((t) => t.id);

  // Group by difficulty
  const byDifficulty = new Map<QuestDifficulty, QuestTemplate[]>();
  for (const quest of available) {
    const list = byDifficulty.get(quest.difficulty) ?? [];
    list.push(quest);
    byDifficulty.set(quest.difficulty, list);
  }

  const selected: string[] = [];
  const difficulties: QuestDifficulty[] = [
    "easy",
    "medium",
    "hard",
    "expert",
    "legendary",
  ];

  // Select at least one from each difficulty if possible, weighted
  for (const diff of difficulties) {
    const quests = byDifficulty.get(diff) ?? [];
    if (quests.length === 0) continue;

    const weight = DIFFICULTY_WEIGHTS[diff];
    const targetCount = Math.max(1, Math.floor((count * weight) / 6));

    // Shuffle and pick
    const shuffled = [...quests].sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, targetCount).map((q) => q.id));
  }

  // Fill remaining slots randomly
  if (selected.length < count) {
    const remaining = available
      .filter((t) => !selected.includes(t.id))
      .sort(() => Math.random() - 0.5);

    selected.push(
      ...remaining.slice(0, count - selected.length).map((q) => q.id),
    );
  }

  return selected.slice(0, count);
}

/** Select featured quest from available quests. */
function selectFeaturedQuest(templates: QuestTemplate[]): string | undefined {
  const candidates = templates.filter((t) => t.enabled && t.canBeFeatured);
  if (candidates.length === 0) return undefined;

  // Prefer quests that haven't been featured recently (would need tracking)
  // For now, random selection weighted by featuredMultiplier
  const weighted = candidates.map((q) => ({
    id: q.id,
    weight: q.featuredMultiplier,
  }));

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;

  for (const { id, weight } of weighted) {
    random -= weight;
    if (random <= 0) return id;
  }

  return candidates[0]?.id;
}

class QuestRotationServiceImpl implements QuestRotationService {
  async generateDailyRotation(
    guildId: GuildId,
  ): Promise<Result<QuestRotation, QuestError>> {
    const configResult = await questRepo.getRotationConfig(guildId);
    if (configResult.isErr()) return ErrResult(configResult.error);
    const config = configResult.unwrap();

    // Get all templates
    const templatesResult = await questRepo.getTemplates(guildId, {
      enabled: true,
    });
    if (templatesResult.isErr()) return ErrResult(templatesResult.error);

    const templates = templatesResult.unwrap();
    if (templates.length === 0) {
      return ErrResult(
        new QuestErrorImpl(
          "INVALID_TEMPLATE",
          "No enabled quest templates found.",
        ),
      );
    }

    // Select quests for daily rotation
    const questIds = selectBalancedQuests(templates, config.dailyQuestCount);

    if (questIds.length === 0) {
      return ErrResult(
        new QuestErrorImpl(
          "INVALID_TEMPLATE",
          "Could not select quests for rotation.",
        ),
      );
    }

    const startsAt = new Date();
    const endsAt = getNextDailyReset(config);

    return questRepo.createRotation({
      guildId,
      type: "daily",
      startsAt,
      endsAt,
      questIds,
    });
  }

  async generateWeeklyRotation(
    guildId: GuildId,
  ): Promise<Result<QuestRotation, QuestError>> {
    const configResult = await questRepo.getRotationConfig(guildId);
    if (configResult.isErr()) return ErrResult(configResult.error);
    const config = configResult.unwrap();

    // Get all templates
    const templatesResult = await questRepo.getTemplates(guildId, {
      enabled: true,
    });
    if (templatesResult.isErr()) return ErrResult(templatesResult.error);

    const templates = templatesResult.unwrap();
    if (templates.length === 0) {
      return ErrResult(
        new QuestErrorImpl(
          "INVALID_TEMPLATE",
          "No enabled quest templates found.",
        ),
      );
    }

    // Select quests for weekly rotation
    const questIds = selectBalancedQuests(templates, config.weeklyQuestCount);

    if (questIds.length === 0) {
      return ErrResult(
        new QuestErrorImpl(
          "INVALID_TEMPLATE",
          "Could not select quests for rotation.",
        ),
      );
    }

    // Select featured quest
    let featuredQuestId: string | undefined;
    if (config.featuredEnabled) {
      featuredQuestId = selectFeaturedQuest(templates);
    }

    const startsAt = new Date();
    const endsAt = getNextWeeklyReset(config);

    // Create the weekly rotation
    const rotationResult = await questRepo.createRotation({
      guildId,
      type: "weekly",
      startsAt,
      endsAt,
      questIds,
      featuredQuestId,
    });

    if (rotationResult.isErr()) return ErrResult(rotationResult.error);

    // Also create a featured rotation if there's a featured quest
    if (featuredQuestId) {
      await questRepo.createRotation({
        guildId,
        type: "featured",
        startsAt,
        endsAt,
        questIds: [featuredQuestId],
        featuredQuestId,
      });
    }

    return rotationResult;
  }

  async ensureCurrentRotations(
    guildId: GuildId,
  ): Promise<Result<RotationStatus, QuestError>> {
    const [currentDaily, currentWeekly, currentFeatured, config] =
      await Promise.all([
        questRepo.getCurrentRotation(guildId, "daily"),
        questRepo.getCurrentRotation(guildId, "weekly"),
        questRepo.getCurrentRotation(guildId, "featured"),
        questRepo.getRotationConfig(guildId),
      ]);

    if (currentDaily.isErr()) return ErrResult(currentDaily.error);
    if (currentWeekly.isErr()) return ErrResult(currentWeekly.error);
    if (config.isErr()) return ErrResult(config.error);

    let dailyActive = !!currentDaily.unwrap();
    let weeklyActive = !!currentWeekly.unwrap();
    const featuredActive = !!currentFeatured.unwrap();
    let generated = false;

    // Generate daily if needed
    if (!currentDaily.unwrap()) {
      const dailyResult = await this.generateDailyRotation(guildId);
      if (dailyResult.isOk()) {
        dailyActive = true;
        generated = true;
      }
    }

    // Generate weekly if needed
    if (!currentWeekly.unwrap()) {
      const weeklyResult = await this.generateWeeklyRotation(guildId);
      if (weeklyResult.isOk()) {
        weeklyActive = true;
        generated = true;
      }
    }

    return OkResult({
      dailyActive,
      dailyExpiresAt: currentDaily.unwrap()?.endsAt ?? null,
      weeklyActive,
      weeklyExpiresAt: currentWeekly.unwrap()?.endsAt ?? null,
      featuredActive,
      generated,
    });
  }

  async refreshRotation(
    guildId: GuildId,
    type: "daily" | "weekly",
  ): Promise<Result<QuestRotation, QuestError>> {
    if (type === "daily") {
      return this.generateDailyRotation(guildId);
    } else {
      return this.generateWeeklyRotation(guildId);
    }
  }

  async getScheduleInfo(
    guildId: GuildId,
  ): Promise<Result<ScheduleInfo, QuestError>> {
    const configResult = await questRepo.getRotationConfig(guildId);
    if (configResult.isErr()) return ErrResult(configResult.error);
    const config = configResult.unwrap();

    return OkResult({
      dailyReset: getNextDailyReset(config),
      weeklyReset: getNextWeeklyReset(config),
      config,
      timezone: "UTC",
    });
  }
}

export const questRotationService: QuestRotationService =
  new QuestRotationServiceImpl();

/** Generate example quest templates for a guild. */
export async function generateExampleQuests(
  guildId: GuildId,
  createdBy: string,
): Promise<Result<number, QuestError>> {
  const examples: Omit<CreateQuestTemplateInput, "id">[] = [
    // Daily quests - Easy
    {
      name: "Trabajador Diligente",
      description: "Usa el comando /work para ganar monedas.",
      category: "economy",
      difficulty: "easy",
      requirements: [{ type: "do_command", command: "work", count: 3 }],
      rewards: [
        { type: "currency", currencyId: "coins", amount: 100 },
        { type: "xp", amount: 50 },
      ],
      cooldownHours: 24,
      maxCompletions: 1,
      canBeFeatured: true,
      featuredMultiplier: 1.5,
    },
    {
      name: "Ahorrador Inicial",
      description: "Deposita monedas en el banco.",
      category: "economy",
      difficulty: "easy",
      requirements: [
        { type: "spend_currency", currencyId: "coins", amount: 500 },
      ],
      rewards: [
        { type: "currency", currencyId: "coins", amount: 50 },
        { type: "xp", amount: 30 },
      ],
      cooldownHours: 24,
      maxCompletions: 1,
    },
    {
      name: "Votante Activo",
      description: "Vota positivamente a otros miembros.",
      category: "social",
      difficulty: "easy",
      requirements: [{ type: "vote_cast", voteType: "love", count: 2 }],
      rewards: [
        { type: "currency", currencyId: "rep", amount: 10 },
        { type: "xp", amount: 40 },
      ],
      cooldownHours: 24,
      maxCompletions: 1,
    },

    // Daily quests - Medium
    {
      name: "Crafter Novato",
      description: "Craftea items usando recetas.",
      category: "crafting",
      difficulty: "medium",
      requirements: [
        { type: "craft_recipe", recipeId: "wood_planks", count: 5 },
      ],
      rewards: [
        { type: "currency", currencyId: "coins", amount: 200 },
        { type: "item", itemId: "crafting_bonus", quantity: 1 },
        { type: "xp", amount: 75 },
      ],
      cooldownHours: 24,
      maxCompletions: 1,
      canBeFeatured: true,
      featuredMultiplier: 1.5,
    },
    {
      name: "Jugador de Minijuegos",
      description: "Gana en el minijuego de trivia.",
      category: "minigame",
      difficulty: "medium",
      requirements: [{ type: "win_minigame", game: "trivia", count: 2 }],
      rewards: [
        { type: "currency", currencyId: "coins", amount: 300 },
        { type: "xp", amount: 100 },
      ],
      cooldownHours: 24,
      maxCompletions: 1,
    },

    // Weekly quests - Hard
    {
      name: "Magnate Económico",
      description: "Gasta una gran cantidad de monedas.",
      category: "economy",
      difficulty: "hard",
      requirements: [
        { type: "spend_currency", currencyId: "coins", amount: 5000 },
      ],
      rewards: [
        { type: "currency", currencyId: "coins", amount: 1000 },
        { type: "quest_token", amount: 5 },
        { type: "xp", amount: 250 },
      ],
      cooldownHours: 168,
      maxCompletions: 1,
      canBeFeatured: true,
      featuredMultiplier: 2.0,
    },
    {
      name: "Maestro Crafter",
      description: "Craftea items avanzados.",
      category: "crafting",
      difficulty: "hard",
      requirements: [
        { type: "craft_recipe", recipeId: "iron_sword", count: 3 },
      ],
      rewards: [
        { type: "item", itemId: "rare_material", quantity: 2 },
        { type: "quest_token", amount: 3 },
        { type: "xp", amount: 300 },
      ],
      cooldownHours: 168,
      maxCompletions: 1,
    },

    // Weekly quests - Expert
    {
      name: "Rey del Coinflip",
      description: "Gana múltiples veces en coinflip.",
      category: "minigame",
      difficulty: "expert",
      requirements: [{ type: "win_minigame", game: "coinflip", count: 10 }],
      rewards: [
        { type: "currency", currencyId: "coins", amount: 2000 },
        { type: "quest_token", amount: 10 },
        { type: "xp", amount: 500 },
      ],
      cooldownHours: 168,
      maxCompletions: 1,
      canBeFeatured: true,
      featuredMultiplier: 2.5,
    },
    {
      name: "Filántropo",
      description: "Vota positivamente muchas veces.",
      category: "social",
      difficulty: "expert",
      requirements: [{ type: "vote_cast", voteType: "love", count: 20 }],
      rewards: [
        { type: "currency", currencyId: "rep", amount: 100 },
        { type: "quest_token", amount: 8 },
        { type: "xp", amount: 400 },
      ],
      cooldownHours: 168,
      maxCompletions: 1,
    },

    // Legendary quest
    {
      name: "Leyenda Viva",
      description: "Completa todas las tareas de un verdadero legendario.",
      category: "general",
      difficulty: "legendary",
      requirements: [
        { type: "do_command", command: "work", count: 50 },
        { type: "spend_currency", currencyId: "coins", amount: 10000 },
        { type: "win_minigame", game: "trivia", count: 10 },
      ],
      rewards: [
        { type: "currency", currencyId: "coins", amount: 5000 },
        { type: "quest_token", amount: 25 },
        { type: "item", itemId: "legendary_chest", quantity: 1 },
        { type: "xp", amount: 1000 },
      ],
      cooldownHours: 168,
      maxCompletions: 1,
      canBeFeatured: true,
      featuredMultiplier: 3.0,
    },
  ];

  let created = 0;
  for (const example of examples) {
    const id = `example_${example.name.toLowerCase().replace(/\s+/g, "_")}`;
    const result = await questRepo.createTemplate(
      guildId,
      { ...example, id },
      createdBy,
    );
    if (result.isOk()) created++;
  }

  return OkResult(created);
}
