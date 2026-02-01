/**
 * Event Repository (Phase 9e).
 *
 * Purpose: Persist and retrieve event configuration per guild.
 * Context: Uses GuildStore for persistence with event subdocument.
 */

import { z } from "zod";
import { GuildStore } from "@/db/repositories/guilds";
import type { GuildId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type {
  EventConfig,
  EventModifiers,
  EventCurrencyConfig,
} from "./types";
import { EventError, buildDefaultEventConfig } from "./types";

/** Zod schema for event currency earn rules. */
const EarnRulesSchema = z.object({
  perDaily: z.number().default(0),
  perWork: z.number().default(0),
  perTriviaWin: z.number().default(0),
  perQuest: z.number().default(0),
  perStorePurchase: z.number().default(0),
  perVote: z.number().default(0),
});

/** Zod schema for event currency config. */
const EventCurrencyConfigSchema = z.object({
  currencyId: z.string(),
  name: z.string(),
  emoji: z.string().default("🎫"),
  earnRules: EarnRulesSchema.default({ perDaily: 0, perWork: 0, perTriviaWin: 0, perQuest: 0, perStorePurchase: 0, perVote: 0 }),
  canExchange: z.boolean().default(false),
  exchangeRate: z.number().default(1),
});

/** Zod schema for event modifiers. */
const EventModifiersSchema = z.object({
  xpMultiplier: z.number().default(1.0),
  dailyRewardBonusPct: z.number().default(0),
  workRewardBonusPct: z.number().default(0),
  triviaRewardBonusPct: z.number().default(0),
  storeDiscountPct: z.number().default(0),
  questRewardBonusPct: z.number().default(0),
  craftingCostReductionPct: z.number().default(0),
});

/** Zod schema for event config. */
const EventConfigSchema = z.object({
  enabled: z.boolean().default(false),
  name: z.string().default(""),
  description: z.string().optional(),
  startsAt: z.date().optional(),
  endsAt: z.date().optional(),
  modifiers: EventModifiersSchema.default({
    xpMultiplier: 1.0,
    dailyRewardBonusPct: 0,
    workRewardBonusPct: 0,
    triviaRewardBonusPct: 0,
    storeDiscountPct: 0,
    questRewardBonusPct: 0,
    craftingCostReductionPct: 0,
  }),
  eventCurrency: EventCurrencyConfigSchema.optional(),
  startedBy: z.string().optional(),
  startedAt: z.date().optional(),
  stoppedBy: z.string().optional(),
  stoppedAt: z.date().optional(),
  version: z.number().default(0),
});

/** Convert DB data to domain model. */
function toDomain(data: z.infer<typeof EventConfigSchema>): EventConfig {
  return {
    enabled: data.enabled,
    name: data.name,
    description: data.description,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    modifiers: data.modifiers as EventModifiers,
    eventCurrency: data.eventCurrency as EventCurrencyConfig | undefined,
    startedBy: data.startedBy,
    startedAt: data.startedAt,
    stoppedBy: data.stoppedBy,
    stoppedAt: data.stoppedAt,
    version: data.version,
  };
}

/** Build DB data from domain model. */
function toData(config: EventConfig): z.infer<typeof EventConfigSchema> {
  return {
    enabled: config.enabled,
    name: config.name,
    description: config.description,
    startsAt: config.startsAt,
    endsAt: config.endsAt,
    modifiers: config.modifiers,
    eventCurrency: config.eventCurrency,
    startedBy: config.startedBy,
    startedAt: config.startedAt,
    stoppedBy: config.stoppedBy,
    stoppedAt: config.stoppedAt,
    version: config.version,
  };
}

export interface EventRepository {
  /**
   * Get event config for a guild.
   */
  getConfig(guildId: GuildId): Promise<Result<EventConfig, Error>>;

  /**
   * Start an event.
   */
  startEvent(
    guildId: GuildId,
    config: Omit<EventConfig, "version">,
  ): Promise<Result<EventConfig, Error>>;

  /**
   * Stop an event.
   */
  stopEvent(
    guildId: GuildId,
    stoppedBy: string,
  ): Promise<Result<EventConfig, Error>>;

  /**
   * Update event config (admin override).
   */
  updateConfig(
    guildId: GuildId,
    updates: Partial<EventConfig>,
  ): Promise<Result<EventConfig, Error>>;
}

class EventRepositoryImpl implements EventRepository {
  async getConfig(guildId: GuildId): Promise<Result<EventConfig, Error>> {
    const guildResult = await GuildStore.get(guildId);
    if (guildResult.isErr()) {
      return ErrResult(guildResult.error);
    }

    const guild = guildResult.unwrap();
    if (!guild) {
      return OkResult(buildDefaultEventConfig());
    }

    const raw = (guild as any).eventConfig;
    if (!raw) {
      return OkResult(buildDefaultEventConfig());
    }

    const parsed = EventConfigSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        `[EventRepo] Invalid event config for guild ${guildId}, using defaults`,
      );
      return OkResult(buildDefaultEventConfig());
    }

    return OkResult(toDomain(parsed.data));
  }

  async startEvent(
    guildId: GuildId,
    config: Omit<EventConfig, "version">,
  ): Promise<Result<EventConfig, Error>> {
    // Check if event already active
    const currentResult = await this.getConfig(guildId);
    if (currentResult.isErr()) {
      return ErrResult(currentResult.error);
    }

    const current = currentResult.unwrap();
    if (current.enabled) {
      return ErrResult(
        new EventError(
          "EVENT_ALREADY_ACTIVE",
          `Event "${current.name}" is already active`,
        ),
      );
    }

    try {
      const col = await GuildStore.collection();
      const newConfig: EventConfig = {
        ...config,
        version: current.version + 1,
      };

      await col.updateOne(
        { _id: guildId } as any,
        {
          $set: {
            eventConfig: toData(newConfig),
          },
        } as any,
      );

      return OkResult(newConfig);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async stopEvent(
    guildId: GuildId,
    stoppedBy: string,
  ): Promise<Result<EventConfig, Error>> {
    const currentResult = await this.getConfig(guildId);
    if (currentResult.isErr()) {
      return ErrResult(currentResult.error);
    }

    const current = currentResult.unwrap();
    if (!current.enabled) {
      return ErrResult(
        new EventError("EVENT_NOT_ACTIVE", "No event is currently active"),
      );
    }

    try {
      const col = await GuildStore.collection();
      const stoppedAt = new Date();

      const updatedConfig: EventConfig = {
        ...current,
        enabled: false,
        stoppedBy,
        stoppedAt,
        version: current.version + 1,
      };

      await col.updateOne(
        { _id: guildId } as any,
        {
          $set: {
            eventConfig: toData(updatedConfig),
          },
        } as any,
      );

      return OkResult(updatedConfig);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateConfig(
    guildId: GuildId,
    updates: Partial<EventConfig>,
  ): Promise<Result<EventConfig, Error>> {
    const currentResult = await this.getConfig(guildId);
    if (currentResult.isErr()) {
      return ErrResult(currentResult.error);
    }

    const current = currentResult.unwrap();

    try {
      const col = await GuildStore.collection();

      const updatedConfig: EventConfig = {
        ...current,
        ...updates,
        version: current.version + 1,
      };

      await col.updateOne(
        { _id: guildId } as any,
        {
          $set: {
            eventConfig: toData(updatedConfig),
          },
        } as any,
      );

      return OkResult(updatedConfig);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

/** Singleton instance. */
export const eventRepository: EventRepository = new EventRepositoryImpl();
