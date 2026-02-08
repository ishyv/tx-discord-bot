/**
 * Event Service (Phase 9e).
 *
 * Purpose: Business logic for event management and modifier application.
 * Context: Provides unified interface for starting/stopping events and applying modifiers.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { GuildId } from "@/db/types";
import { eventRepository } from "./repository";
import type {
  EventConfig,
  EventStatus,
  StartEventInput,
  StartEventResult,
  StopEventResult,
  EventModifiers,
} from "./types";
import {
  EventError,
  isEventActive,
  buildDefaultEventConfig,
  buildEventModifiers,
} from "./types";

export class EventService {
  async getEventStatus(guildId: GuildId): Promise<Result<EventStatus, Error>> {
    const configResult = await eventRepository.getConfig(guildId);
    if (configResult.isErr()) {
      return ErrResult(configResult.error);
    }

    const config = configResult.unwrap();
    const active = isEventActive(config);

    let timeRemaining: number | undefined;
    if (active && config.endsAt) {
      timeRemaining = config.endsAt.getTime() - Date.now();
    }

    return OkResult({
      active,
      name: config.name,
      description: config.description,
      timeRemaining,
      modifiers: config.modifiers,
      eventCurrency: config.eventCurrency,
      startedAt: config.startedAt,
      endsAt: config.endsAt,
    });
  }

  async startEvent(
    guildId: GuildId,
    input: StartEventInput,
    startedBy: string,
  ): Promise<Result<StartEventResult, Error>> {
    // Validate duration
    if (input.durationHours !== undefined && input.durationHours <= 0) {
      return ErrResult(
        new EventError("INVALID_DURATION", "Duration must be positive"),
      );
    }

    // Build modifiers
    const modifiers = buildEventModifiers(input.modifiers);

    // Validate modifiers
    if (modifiers.xpMultiplier < 0.1 || modifiers.xpMultiplier > 5) {
      return ErrResult(
        new EventError(
          "INVALID_MODIFIERS",
          "XP multiplier must be between 0.1 and 5",
        ),
      );
    }

    // Calculate dates
    const startsAt = new Date();
    const endsAt = input.durationHours
      ? new Date(startsAt.getTime() + input.durationHours * 60 * 60 * 1000)
      : undefined;

    // Build event currency if provided
    let eventCurrency = input.eventCurrency
      ? {
          ...input.eventCurrency,
          earnRules: {
            perDaily: input.eventCurrency.earnRules?.perDaily ?? 0,
            perWork: input.eventCurrency.earnRules?.perWork ?? 0,
            perTriviaWin: input.eventCurrency.earnRules?.perTriviaWin ?? 0,
            perQuest: input.eventCurrency.earnRules?.perQuest ?? 0,
            perStorePurchase: input.eventCurrency.earnRules?.perStorePurchase ?? 0,
            perVote: input.eventCurrency.earnRules?.perVote ?? 0,
          },
        }
      : undefined;

    // Build config
    const config: Omit<EventConfig, "version"> = {
      enabled: true,
      name: input.name,
      description: input.description,
      startsAt,
      endsAt,
      modifiers,
      eventCurrency,
      startedBy,
      startedAt: startsAt,
    };

    // Save to repository
    const startResult = await eventRepository.startEvent(guildId, config);
    if (startResult.isErr()) {
      return ErrResult(startResult.error);
    }

    return OkResult({
      success: true,
      name: input.name,
      startsAt,
      endsAt,
      modifiers,
    });
  }

  async stopEvent(
    guildId: GuildId,
    stoppedBy: string,
  ): Promise<Result<StopEventResult, Error>> {
    const stopResult = await eventRepository.stopEvent(guildId, stoppedBy);
    if (stopResult.isErr()) {
      return ErrResult(stopResult.error);
    }

    const config = stopResult.unwrap();
    const duration =
      config.stoppedAt && config.startedAt
        ? config.stoppedAt.getTime() - config.startedAt.getTime()
        : 0;

    return OkResult({
      success: true,
      stoppedAt: config.stoppedAt!,
      duration,
    });
  }

  async getActiveModifiers(
    guildId: GuildId,
  ): Promise<Result<EventModifiers, Error>> {
    const configResult = await eventRepository.getConfig(guildId);
    if (configResult.isErr()) {
      return ErrResult(configResult.error);
    }

    const config = configResult.unwrap();
    if (!isEventActive(config)) {
      return OkResult(buildDefaultEventConfig().modifiers);
    }

    return OkResult(config.modifiers);
  }

  async applyXPMultiplier(
    guildId: GuildId,
    baseXP: number,
  ): Promise<Result<number, Error>> {
    const modifiersResult = await this.getActiveModifiers(guildId);
    if (modifiersResult.isErr()) {
      return ErrResult(modifiersResult.error);
    }

    const modifiers = modifiersResult.unwrap();
    return OkResult(Math.round(baseXP * modifiers.xpMultiplier));
  }

  async applyDailyBonus(
    guildId: GuildId,
    baseReward: number,
  ): Promise<Result<number, Error>> {
    const modifiersResult = await this.getActiveModifiers(guildId);
    if (modifiersResult.isErr()) {
      return ErrResult(modifiersResult.error);
    }

    const modifiers = modifiersResult.unwrap();
    const bonus = Math.round(baseReward * modifiers.dailyRewardBonusPct);
    return OkResult(baseReward + bonus);
  }

  async applyWorkBonus(
    guildId: GuildId,
    baseReward: number,
  ): Promise<Result<number, Error>> {
    const modifiersResult = await this.getActiveModifiers(guildId);
    if (modifiersResult.isErr()) {
      return ErrResult(modifiersResult.error);
    }

    const modifiers = modifiersResult.unwrap();
    const bonus = Math.round(baseReward * modifiers.workRewardBonusPct);
    return OkResult(baseReward + bonus);
  }

  async applyTriviaBonus(
    guildId: GuildId,
    baseReward: number,
  ): Promise<Result<number, Error>> {
    const modifiersResult = await this.getActiveModifiers(guildId);
    if (modifiersResult.isErr()) {
      return ErrResult(modifiersResult.error);
    }

    const modifiers = modifiersResult.unwrap();
    const bonus = Math.round(baseReward * modifiers.triviaRewardBonusPct);
    return OkResult(baseReward + bonus);
  }

  async applyStoreDiscount(
    guildId: GuildId,
    basePrice: number,
  ): Promise<Result<number, Error>> {
    const modifiersResult = await this.getActiveModifiers(guildId);
    if (modifiersResult.isErr()) {
      return ErrResult(modifiersResult.error);
    }

    const modifiers = modifiersResult.unwrap();
    const discount = basePrice * modifiers.storeDiscountPct;
    return OkResult(Math.max(1, Math.round(basePrice - discount)));
  }

  async applyQuestBonus(
    guildId: GuildId,
    baseReward: number,
  ): Promise<Result<number, Error>> {
    const modifiersResult = await this.getActiveModifiers(guildId);
    if (modifiersResult.isErr()) {
      return ErrResult(modifiersResult.error);
    }

    const modifiers = modifiersResult.unwrap();
    const bonus = Math.round(baseReward * modifiers.questRewardBonusPct);
    return OkResult(baseReward + bonus);
  }

  async applyCraftingReduction(
    guildId: GuildId,
    baseCost: number,
  ): Promise<Result<number, Error>> {
    const modifiersResult = await this.getActiveModifiers(guildId);
    if (modifiersResult.isErr()) {
      return ErrResult(modifiersResult.error);
    }

    const modifiers = modifiersResult.unwrap();
    const reduction = baseCost * modifiers.craftingCostReductionPct;
    return OkResult(Math.max(1, Math.round(baseCost - reduction)));
  }
}

/** Singleton instance. */
export const eventService = new EventService();
