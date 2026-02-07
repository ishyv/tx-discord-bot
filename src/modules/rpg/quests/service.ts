import type { GuildId, UserId } from "@/db/types";
import { UserStore } from "@/db/repositories/users";
import { runUserTransition } from "@/db/user-transition";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { currencyRegistry } from "@/modules/economy/transactions";
import { progressionService } from "@/modules/economy/progression/service";
import { getLevelFromXP } from "@/modules/economy/progression/curve";
import { perkService } from "@/modules/economy/perks/service";
import { simulateCapacityAfterAdd } from "@/modules/inventory/capacity";
import {
  normalizeInventory,
  type ItemInventory,
} from "@/modules/inventory/inventory";
import type { CurrencyInventory } from "@/modules/economy/currency";
import {
  ErrResult,
  OkResult,
  type Result,
} from "@/utils/result";
import { ProgressionStateSchema } from "@/db/schemas/progression";
import {
  buildStepProgressText,
  getStepProgressIncrement,
  getStepTarget,
  mapAuditEntryToQuestEvents,
} from "./events";
import { loadQuestRegistry, type QuestRegistry } from "./registry";
import {
  buildQuestProgressDocId,
  rpgQuestProgressRepo,
} from "./repository";
import type {
  ActiveQuestState,
  QuestClaimError,
  QuestClaimResult,
  QuestDef,
  QuestEvent,
  QuestBrowseView,
} from "./types";
import { QuestClaimError as QuestClaimErrorClass } from "./types";

const CLAIM_LOCK_STALE_MS = 5 * 60_000;

function buildCorrelation(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneStepProgress(stepCount: number): number[] {
  return new Array(stepCount).fill(0);
}

function isStepComplete(quest: QuestDef, stepProgress: readonly number[]): boolean {
  return quest.steps.every((step, idx) => {
    const target = getStepTarget(step);
    return (stepProgress[idx] ?? 0) >= target;
  });
}

function getRepeatCooldownMs(quest: QuestDef): number {
  switch (quest.repeat.kind) {
    case "none":
      return Number.POSITIVE_INFINITY;
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "cooldown":
      return quest.repeat.hours * 60 * 60 * 1000;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function formatStepProgress(quest: QuestDef, stepProgress: readonly number[]) {
  return quest.steps.map((step, idx) => {
    const current = stepProgress[idx] ?? 0;
    const target = getStepTarget(step);
    return {
      current: Math.min(target, Math.max(0, current)),
      target,
      done: current >= target,
      label: buildStepProgressText(step, current),
    };
  });
}

function getCurrencyRewardValue(currencyId: string, amount: number): unknown {
  if (currencyId === "coins") {
    return {
      hand: amount,
      bank: 0,
      use_total_on_subtract: false,
    };
  }
  return amount;
}

function normalizeProgressionState(raw: unknown): {
  totalXP: number;
  level: number;
  updatedAt: Date;
  cooldowns: Record<string, Date>;
} {
  try {
    return ProgressionStateSchema.parse(raw ?? {});
  } catch {
    return {
      totalXP: 0,
      level: 1,
      updatedAt: new Date(),
      cooldowns: {},
    };
  }
}

function buildClaimResultFromQuest(
  quest: QuestDef,
  correlationId: string,
): QuestClaimResult {
  const applied: QuestClaimResult["appliedRewards"] = [];

  quest.rewards.currency?.forEach((reward) => {
    applied.push({
      type: "currency",
      id: reward.id,
      amount: reward.amount,
    });
  });

  if ((quest.rewards.xp ?? 0) > 0) {
    applied.push({ type: "xp", amount: quest.rewards.xp ?? 0 });
  }

  quest.rewards.items?.forEach((reward) => {
    applied.push({
      type: "item",
      id: reward.itemId,
      amount: reward.qty,
    });
  });

  if ((quest.rewards.tokens ?? 0) > 0) {
    applied.push({
      type: "token",
      id: "quest_tokens",
      amount: quest.rewards.tokens ?? 0,
    });
  }

  return {
    questId: quest.id,
    correlationId,
    appliedRewards: applied,
  };
}

async function getUserProfession(userId: UserId): Promise<"miner" | "lumber" | null> {
  try {
    const { rpgProfileRepo } = await import("@/modules/rpg/profile/repository");
    const result = await rpgProfileRepo.findById(userId);
    if (result.isErr() || !result.unwrap()) {
      return null;
    }
    return result.unwrap()!.starterKitType;
  } catch {
    return null;
  }
}

async function getUserLevel(guildId: GuildId, userId: UserId): Promise<number> {
  const result = await progressionService.getProgressView(guildId, userId);
  if (result.isErr()) {
    return 1;
  }
  return result.unwrap().level;
}

function canAcceptQuest(
  quest: QuestDef,
  history: Record<string, { completedCount: number; lastClaimedAt?: Date }>,
  profession: string | null,
  level: number,
): Result<void, QuestClaimError> {
  const prerequisites = quest.prerequisites;

  if (prerequisites?.profession && prerequisites.profession !== profession) {
    return ErrResult(
      new QuestClaimErrorClass(
        "PREREQUISITES_NOT_MET",
        `Requires profession ${prerequisites.profession}.`,
      ),
    );
  }

  if (prerequisites?.minLevel && level < prerequisites.minLevel) {
    return ErrResult(
      new QuestClaimErrorClass(
        "PREREQUISITES_NOT_MET",
        `Requires level ${prerequisites.minLevel}.`,
      ),
    );
  }

  for (const requiredQuestId of prerequisites?.requiresQuestsCompleted ?? []) {
    const completedCount = history[requiredQuestId]?.completedCount ?? 0;
    if (completedCount <= 0) {
      return ErrResult(
        new QuestClaimErrorClass(
          "PREREQUISITES_NOT_MET",
          `Quest '${requiredQuestId}' must be completed first.`,
        ),
      );
    }
  }

  const questHistory = history[quest.id];
  if (quest.repeat.kind === "none") {
    if ((questHistory?.completedCount ?? 0) > 0) {
      return ErrResult(
        new QuestClaimErrorClass(
          "COOLDOWN_ACTIVE",
          "Quest can only be completed once.",
        ),
      );
    }
    return OkResult(undefined);
  }

  const lastClaimedAt = questHistory?.lastClaimedAt;
  if (!lastClaimedAt) {
    return OkResult(undefined);
  }

  const cooldownMs = getRepeatCooldownMs(quest);
  const nextAvailableAt = lastClaimedAt.getTime() + cooldownMs;
  if (Date.now() < nextAvailableAt) {
    return ErrResult(
      new QuestClaimErrorClass(
        "COOLDOWN_ACTIVE",
        `Quest is on cooldown until ${new Date(nextAvailableAt).toISOString()}.`,
      ),
    );
  }

  return OkResult(undefined);
}

async function applyRewardsAtomically(
  guildId: GuildId,
  userId: UserId,
  quest: QuestDef,
): Promise<Result<QuestClaimResult["appliedRewards"], QuestClaimError>> {
  type ClaimTransitionSnapshot = {
    inventory: ItemInventory;
    currency: CurrencyInventory;
    progression: Record<string, unknown>;
  };

  type ClaimTransitionNext = {
    inventory: ItemInventory;
    currency: CurrencyInventory;
    progression: Record<string, unknown>;
    appliedRewards: QuestClaimResult["appliedRewards"];
  };

  const limitsResult = await perkService.getCapacityLimits(guildId, userId);
  const capacityLimits = limitsResult.isOk() ? limitsResult.unwrap() : undefined;

  const transition = await runUserTransition<
    ClaimTransitionSnapshot,
    ClaimTransitionNext,
    QuestClaimResult["appliedRewards"]
  >(
    userId,
    {
      attempts: 4,
      getSnapshot: (user) => ({
        inventory: normalizeInventory(user.inventory),
        currency: (user.currency ?? {}) as CurrencyInventory,
        progression: (user.progression ?? {}) as Record<string, unknown>,
      }),
      computeNext: (snapshot) => {
        const nextInventory: ItemInventory = { ...snapshot.inventory };
        const nextCurrency: CurrencyInventory = { ...snapshot.currency };
        const nextProgression: Record<string, unknown> = { ...snapshot.progression };
        const appliedRewards: QuestClaimResult["appliedRewards"] = [];

        for (const reward of quest.rewards.items ?? []) {
          const simulated = simulateCapacityAfterAdd(
            nextInventory,
            reward.itemId,
            reward.qty,
            { limits: capacityLimits },
          );

          if (simulated.weightExceeded || simulated.slotsExceeded) {
            return ErrResult(
              new QuestClaimErrorClass(
                "CAPACITY_EXCEEDED",
                `Not enough inventory space for ${reward.itemId}.`,
              ),
            );
          }

          const current = nextInventory[reward.itemId]?.quantity ?? 0;
          nextInventory[reward.itemId] = {
            id: reward.itemId,
            quantity: current + reward.qty,
          };

          appliedRewards.push({ type: "item", id: reward.itemId, amount: reward.qty });
        }

        for (const reward of quest.rewards.currency ?? []) {
          const currencyDef = currencyRegistry.get(reward.id);

          if (currencyDef) {
            const current = nextCurrency[reward.id] ?? currencyDef.zero();
            const value = getCurrencyRewardValue(reward.id, reward.amount);
            const next = currencyDef.add(current as any, value as any);

            if (!currencyDef.isValid(next as any)) {
              return ErrResult(
                new QuestClaimErrorClass(
                  "UPDATE_FAILED",
                  `Currency reward failed for ${reward.id}.`,
                ),
              );
            }

            nextCurrency[reward.id] = next;
          } else {
            const current =
              typeof nextCurrency[reward.id] === "number"
                ? (nextCurrency[reward.id] as number)
                : 0;
            nextCurrency[reward.id] = current + reward.amount;
          }

          appliedRewards.push({ type: "currency", id: reward.id, amount: reward.amount });
        }

        if ((quest.rewards.tokens ?? 0) > 0) {
          const current =
            typeof nextCurrency.quest_tokens === "number"
              ? (nextCurrency.quest_tokens as number)
              : 0;
          nextCurrency.quest_tokens = current + (quest.rewards.tokens ?? 0);
          appliedRewards.push({
            type: "token",
            id: "quest_tokens",
            amount: quest.rewards.tokens ?? 0,
          });
        }

        if ((quest.rewards.xp ?? 0) > 0) {
          const currentProgression = normalizeProgressionState(nextProgression[guildId]);
          const nextTotalXP = currentProgression.totalXP + (quest.rewards.xp ?? 0);
          nextProgression[guildId] = {
            ...currentProgression,
            totalXP: nextTotalXP,
            level: getLevelFromXP(nextTotalXP),
            updatedAt: new Date(),
          };

          appliedRewards.push({
            type: "xp",
            amount: quest.rewards.xp ?? 0,
          });
        }

        return OkResult({
          inventory: nextInventory,
          currency: nextCurrency,
          progression: nextProgression,
          appliedRewards,
        });
      },
      commit: (uid, expected, next) =>
        UserStore.replaceIfMatch(
          uid,
          {
            inventory: expected.inventory,
            currency: expected.currency,
            progression: expected.progression,
          } as any,
          {
            inventory: next.inventory,
            currency: next.currency,
            progression: next.progression,
          } as any,
        ),
      project: (_updated, next) => next.appliedRewards,
      conflictError: "QUEST_REWARD_CONFLICT",
    },
  );

  if (transition.isErr()) {
    const message = transition.error.message;
    if (message.includes("CAPACITY_EXCEEDED")) {
      return ErrResult(
        new QuestClaimErrorClass("CAPACITY_EXCEEDED", "Inventory capacity exceeded."),
      );
    }

    if (transition.error instanceof QuestClaimErrorClass) {
      return ErrResult(transition.error);
    }

    return ErrResult(
      new QuestClaimErrorClass(
        "UPDATE_FAILED",
        transition.error.message || "Could not apply quest rewards.",
      ),
    );
  }

  return OkResult(transition.unwrap());
}

export interface RpgQuestService {
  ensureReady(): Promise<Result<void, Error>>;
  getBoard(guildId: GuildId, userId: UserId): Promise<Result<QuestBrowseView, QuestClaimError>>;
  acceptQuest(guildId: GuildId, userId: UserId, questId: string): Promise<Result<void, QuestClaimError>>;
  abandonQuest(guildId: GuildId, userId: UserId, questId: string): Promise<Result<void, QuestClaimError>>;
  onEvent(event: QuestEvent): Promise<Result<void, Error>>;
  processAuditEntry(entry: import("@/modules/economy/audit").EconomyAuditEntry): Promise<void>;
  claimRewards(
    guildId: GuildId,
    userId: UserId,
    questId: string,
    correlationId?: string,
  ): Promise<Result<QuestClaimResult, QuestClaimError>>;
}

class RpgQuestServiceImpl implements RpgQuestService {
  private registry: QuestRegistry | null = null;

  async ensureReady(): Promise<Result<void, Error>> {
    try {
      this.registry = await loadQuestRegistry();
      await rpgQuestProgressRepo.ensureIndexes();
      return OkResult(undefined);
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async ensureRegistry(): Promise<Result<QuestRegistry, QuestClaimError>> {
    try {
      if (!this.registry) {
        this.registry = await loadQuestRegistry();
      }
      return OkResult(this.registry);
    } catch (error) {
      return ErrResult(
        new QuestClaimErrorClass(
          "UPDATE_FAILED",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async getBoard(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<QuestBrowseView, QuestClaimError>> {
    const registryResult = await this.ensureRegistry();
    if (registryResult.isErr()) {
      return ErrResult(registryResult.error);
    }

    const registry = registryResult.unwrap();
    const progressResult = await rpgQuestProgressRepo.get(guildId, userId);
    if (progressResult.isErr()) {
      return ErrResult(
        new QuestClaimErrorClass("UPDATE_FAILED", progressResult.error.message),
      );
    }

    const progress = progressResult.unwrap();
    const profession = await getUserProfession(userId);
    const level = await getUserLevel(guildId, userId);

    const active = Object.values(progress.active)
      .map((state) => {
        const quest = registry.getQuest(state.questId);
        if (!quest || quest.enabled === false) {
          return null;
        }

        const steps = formatStepProgress(quest, state.stepProgress);

        return {
          quest,
          steps,
          completed: !!state.completedAt,
          claimed: !!state.claimedAt,
          acceptedAt: state.acceptedAt,
          completedAt: state.completedAt,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
      .sort((a, b) => a.quest.title.localeCompare(b.quest.title));

    const available = registry
      .listQuests({ enabledOnly: true })
      .filter((quest) => !progress.active[quest.id])
      .filter((quest) => {
        const check = canAcceptQuest(quest, progress.history, profession, level);
        return check.isOk();
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    return OkResult({ available, active });
  }

  async acceptQuest(
    guildId: GuildId,
    userId: UserId,
    questId: string,
  ): Promise<Result<void, QuestClaimError>> {
    const registryResult = await this.ensureRegistry();
    if (registryResult.isErr()) {
      return ErrResult(registryResult.error);
    }

    const quest = registryResult.unwrap().getQuest(questId);
    if (!quest) {
      return ErrResult(new QuestClaimErrorClass("QUEST_NOT_FOUND", "Quest not found."));
    }

    if (quest.enabled === false) {
      return ErrResult(new QuestClaimErrorClass("QUEST_DISABLED", "Quest is disabled."));
    }

    const progressResult = await rpgQuestProgressRepo.get(guildId, userId);
    if (progressResult.isErr()) {
      return ErrResult(
        new QuestClaimErrorClass("UPDATE_FAILED", progressResult.error.message),
      );
    }

    const progress = progressResult.unwrap();
    if (progress.active[questId]) {
      return ErrResult(
        new QuestClaimErrorClass("QUEST_ALREADY_ACCEPTED", "Quest already accepted."),
      );
    }

    const profession = await getUserProfession(userId);
    const level = await getUserLevel(guildId, userId);
    const eligibility = canAcceptQuest(quest, progress.history, profession, level);
    if (eligibility.isErr()) {
      return ErrResult(eligibility.error);
    }

    const now = new Date();
    const activeState: ActiveQuestState = {
      questId,
      stepProgress: cloneStepProgress(quest.steps.length),
      acceptedAt: now,
    };

    const docId = buildQuestProgressDocId(guildId, userId);
    const collection = await rpgQuestProgressRepo.getCollection();
    await collection.updateOne(
      { _id: docId } as any,
      {
        $set: {
          guildId,
          userId,
          [`active.${questId}`]: activeState,
          updatedAt: now,
        } as any,
        $setOnInsert: {
          _id: docId,
          createdAt: now,
          history: {},
        } as any,
      },
      { upsert: true },
    );

    await economyAuditRepo.create({
      operationType: "quest_accept",
      actorId: userId,
      targetId: userId,
      guildId,
      source: "rpg-quests",
      reason: `Accepted quest ${questId}`,
      metadata: {
        questId,
        correlationId: buildCorrelation("quest_accept"),
      },
    });

    return OkResult(undefined);
  }

  async abandonQuest(
    guildId: GuildId,
    userId: UserId,
    questId: string,
  ): Promise<Result<void, QuestClaimError>> {
    const progressResult = await rpgQuestProgressRepo.get(guildId, userId);
    if (progressResult.isErr()) {
      return ErrResult(
        new QuestClaimErrorClass("UPDATE_FAILED", progressResult.error.message),
      );
    }

    const progress = progressResult.unwrap();
    if (!progress.active[questId]) {
      return ErrResult(
        new QuestClaimErrorClass("QUEST_NOT_ACCEPTED", "Quest is not active."),
      );
    }

    const docId = buildQuestProgressDocId(guildId, userId);
    const collection = await rpgQuestProgressRepo.getCollection();
    await collection.updateOne(
      { _id: docId } as any,
      {
        $unset: { [`active.${questId}`]: "" } as any,
        $set: { updatedAt: new Date() } as any,
      },
    );

    return OkResult(undefined);
  }

  async onEvent(event: QuestEvent): Promise<Result<void, Error>> {
    const registry = this.registry ?? (await loadQuestRegistry());
    this.registry = registry;

    const progressResult = await rpgQuestProgressRepo.get(event.guildId, event.userId);
    if (progressResult.isErr()) {
      return ErrResult(progressResult.error);
    }

    const progress = progressResult.unwrap();
    const incOps: Record<string, number> = {};
    const minOps: Record<string, number> = {};
    const touchedQuestIds: string[] = [];

    for (const active of Object.values(progress.active)) {
      if (active.completedAt || active.claimedAt) {
        continue;
      }

      const quest = registry.getQuest(active.questId);
      if (!quest || quest.enabled === false) {
        continue;
      }

      let touched = false;
      for (let idx = 0; idx < quest.steps.length; idx += 1) {
        const step = quest.steps[idx]!;
        const increment = getStepProgressIncrement(step, event);
        if (increment <= 0) {
          continue;
        }

        touched = true;
        const path = `active.${quest.id}.stepProgress.${idx}`;
        incOps[path] = (incOps[path] ?? 0) + increment;
        minOps[path] = getStepTarget(step);
      }

      if (touched) {
        touchedQuestIds.push(quest.id);
      }
    }

    if (touchedQuestIds.length === 0) {
      return OkResult(undefined);
    }

    const docId = buildQuestProgressDocId(event.guildId, event.userId);
    const collection = await rpgQuestProgressRepo.getCollection();
    await collection.updateOne(
      { _id: docId } as any,
      {
        ...(Object.keys(incOps).length > 0 ? ({ $inc: incOps } as any) : {}),
        ...(Object.keys(minOps).length > 0 ? ({ $min: minOps } as any) : {}),
        $set: { updatedAt: new Date() } as any,
      },
    );

    const refreshedResult = await rpgQuestProgressRepo.get(event.guildId, event.userId);
    if (refreshedResult.isErr()) {
      return ErrResult(refreshedResult.error);
    }

    const refreshed = refreshedResult.unwrap();
    const completionUpdates: Record<string, Date> = {};
    const completedQuestIds: string[] = [];

    for (const questId of touchedQuestIds) {
      const active = refreshed.active[questId];
      if (!active || active.completedAt || active.claimedAt) {
        continue;
      }

      const quest = registry.getQuest(questId);
      if (!quest) {
        continue;
      }

      if (isStepComplete(quest, active.stepProgress)) {
        const completedAt = new Date();
        completionUpdates[`active.${questId}.completedAt`] = completedAt;
        completionUpdates[`history.${questId}.lastCompletedAt`] = completedAt;
        completedQuestIds.push(questId);
      }
    }

    if (completedQuestIds.length > 0) {
      await collection.updateOne(
        { _id: docId } as any,
        {
          $set: {
            ...completionUpdates,
            updatedAt: new Date(),
          } as any,
        },
      );

      for (const questId of completedQuestIds) {
        await economyAuditRepo.create({
          operationType: "quest_complete",
          actorId: event.userId,
          targetId: event.userId,
          guildId: event.guildId,
          source: "rpg-quests",
          reason: `Completed quest ${questId}`,
          metadata: {
            questId,
            correlationId: buildCorrelation("quest_complete"),
            eventType: event.type,
          },
        });
      }
    }

    return OkResult(undefined);
  }

  async processAuditEntry(
    entry: import("@/modules/economy/audit").EconomyAuditEntry,
  ): Promise<void> {
    try {
      const events = mapAuditEntryToQuestEvents(entry);
      for (const event of events) {
        const result = await this.onEvent(event);
        if (result.isErr()) {
          console.error("[RpgQuestService] Failed to process event:", result.error);
        }
      }
    } catch (error) {
      console.error("[RpgQuestService] processAuditEntry error:", error);
    }
  }

  async claimRewards(
    guildId: GuildId,
    userId: UserId,
    questId: string,
    correlationId?: string,
  ): Promise<Result<QuestClaimResult, QuestClaimError>> {
    const registryResult = await this.ensureRegistry();
    if (registryResult.isErr()) {
      return ErrResult(registryResult.error);
    }

    const quest = registryResult.unwrap().getQuest(questId);
    if (!quest) {
      return ErrResult(new QuestClaimErrorClass("QUEST_NOT_FOUND", "Quest not found."));
    }

    const progressResult = await rpgQuestProgressRepo.get(guildId, userId);
    if (progressResult.isErr()) {
      return ErrResult(
        new QuestClaimErrorClass("UPDATE_FAILED", progressResult.error.message),
      );
    }

    const progress = progressResult.unwrap();
    const history = progress.history[questId];
    const active = progress.active[questId];

    if (!active) {
      if (
        correlationId &&
        history?.lastClaimCorrelationId === correlationId &&
        history.lastClaimedAt
      ) {
        return OkResult(buildClaimResultFromQuest(quest, correlationId));
      }

      if ((history?.completedCount ?? 0) > 0) {
        return ErrResult(
          new QuestClaimErrorClass(
            "REWARDS_ALREADY_CLAIMED",
            "Rewards were already claimed for this quest.",
          ),
        );
      }

      return ErrResult(
        new QuestClaimErrorClass("QUEST_NOT_ACCEPTED", "Quest is not active."),
      );
    }

    if (!active.completedAt) {
      return ErrResult(
        new QuestClaimErrorClass("QUEST_NOT_COMPLETED", "Quest is not completed yet."),
      );
    }

    if (active.claimedAt) {
      if (correlationId && active.claimCorrelationId === correlationId) {
        return OkResult(buildClaimResultFromQuest(quest, correlationId));
      }

      return ErrResult(
        new QuestClaimErrorClass(
          "REWARDS_ALREADY_CLAIMED",
          "Rewards were already claimed for this quest.",
        ),
      );
    }

    const now = Date.now();
    const claimCorrelationId = correlationId ?? buildCorrelation("quest_claim");

    if (active.claimInFlight) {
      const ageMs = now - active.claimInFlight.startedAt.getTime();
      if (ageMs < CLAIM_LOCK_STALE_MS) {
        return ErrResult(
          new QuestClaimErrorClass(
            "CLAIM_IN_PROGRESS",
            "A claim is already in progress for this quest.",
          ),
        );
      }
    }

    const docId = buildQuestProgressDocId(guildId, userId);
    const collection = await rpgQuestProgressRepo.getCollection();

    const lockResult = await collection.findOneAndUpdate(
      {
        _id: docId,
        [`active.${questId}.completedAt`]: { $exists: true },
        [`active.${questId}.claimedAt`]: { $exists: false },
        $or: [
          { [`active.${questId}.claimInFlight`]: { $exists: false } },
          {
            [`active.${questId}.claimInFlight.startedAt`]: {
              $lte: new Date(Date.now() - CLAIM_LOCK_STALE_MS),
            },
          },
        ],
      } as any,
      {
        $set: {
          [`active.${questId}.claimInFlight`]: {
            correlationId: claimCorrelationId,
            startedAt: new Date(),
          },
          updatedAt: new Date(),
        } as any,
      },
      { returnDocument: "after" },
    );

    if (!lockResult) {
      const refreshed = await rpgQuestProgressRepo.get(guildId, userId);
      if (refreshed.isOk()) {
        const refreshedActive = refreshed.unwrap().active[questId];
        if (!refreshedActive) {
          const refreshedHistory = refreshed.unwrap().history[questId];
          if (
            refreshedHistory?.lastClaimCorrelationId === claimCorrelationId &&
            refreshedHistory.lastClaimedAt
          ) {
            return OkResult(buildClaimResultFromQuest(quest, claimCorrelationId));
          }
        }
      }

      return ErrResult(
        new QuestClaimErrorClass(
          "CLAIM_IN_PROGRESS",
          "Could not acquire claim lock for quest rewards.",
        ),
      );
    }

    const rewardsResult = await applyRewardsAtomically(guildId, userId, quest);
    if (rewardsResult.isErr()) {
      await collection.updateOne(
        { _id: docId, [`active.${questId}.claimInFlight.correlationId`]: claimCorrelationId } as any,
        {
          $unset: { [`active.${questId}.claimInFlight`]: "" } as any,
          $set: { updatedAt: new Date() } as any,
        },
      );
      return ErrResult(rewardsResult.error);
    }

    const claimedAt = new Date();
    await collection.updateOne(
      {
        _id: docId,
        [`active.${questId}.claimInFlight.correlationId`]: claimCorrelationId,
      } as any,
      {
        $set: {
          [`history.${questId}.lastCompletedAt`]: active.completedAt,
          [`history.${questId}.lastClaimedAt`]: claimedAt,
          [`history.${questId}.lastClaimCorrelationId`]: claimCorrelationId,
          updatedAt: claimedAt,
        } as any,
        $inc: {
          [`history.${questId}.completedCount`]: 1,
        } as any,
        $unset: {
          [`active.${questId}`]: "",
        } as any,
      },
    );

    await economyAuditRepo.create({
      operationType: "quest_claim",
      actorId: userId,
      targetId: userId,
      guildId,
      source: "rpg-quests",
      reason: `Claimed quest ${questId}`,
      metadata: {
        questId,
        correlationId: claimCorrelationId,
        rewards: rewardsResult.unwrap(),
      },
    });

    return OkResult({
      questId,
      correlationId: claimCorrelationId,
      appliedRewards: rewardsResult.unwrap(),
    });
  }
}

export const rpgQuestService: RpgQuestService = new RpgQuestServiceImpl();
