import type { GuildId, UserId } from "@/db/types";
import type { Profession } from "@/modules/content";

export type QuestId = string;

export type QuestDifficulty =
  | "easy"
  | "medium"
  | "hard"
  | "expert"
  | "legendary";

export type QuestRepeat =
  | { kind: "none" }
  | { kind: "daily" }
  | { kind: "weekly" }
  | { kind: "cooldown"; hours: number };

export interface QuestPrerequisites {
  readonly profession?: Profession;
  readonly minLevel?: number;
  readonly requiresQuestsCompleted?: readonly QuestId[];
}

export interface QuestCurrencyReward {
  readonly id: string;
  readonly amount: number;
}

export interface QuestItemReward {
  readonly itemId: string;
  readonly qty: number;
}

export interface QuestRewards {
  readonly currency?: readonly QuestCurrencyReward[];
  readonly xp?: number;
  readonly items?: readonly QuestItemReward[];
  /** Stored as `currency.quest_tokens` on the user document. */
  readonly tokens?: number;
}

export interface GatherItemStep {
  readonly kind: "gather_item";
  readonly action: "mine" | "forest";
  readonly itemId: string;
  readonly qty: number;
  readonly locationTierMin?: number;
  readonly locationTierMax?: number;
  readonly toolTierMin?: number;
}

export interface ProcessItemStep {
  readonly kind: "process_item";
  readonly inputItemId: string;
  readonly outputItemId?: string;
  readonly qty: number;
  readonly successOnly?: boolean;
}

export interface CraftRecipeStep {
  readonly kind: "craft_recipe";
  readonly recipeId: string;
  readonly qty: number;
}

export interface MarketListItemStep {
  readonly kind: "market_list_item";
  readonly itemId: string;
  readonly qty: number;
}

export interface MarketBuyItemStep {
  readonly kind: "market_buy_item";
  readonly itemId: string;
  readonly qty: number;
}

export interface FightWinStep {
  readonly kind: "fight_win";
  readonly qty: number;
}

export type QuestStep =
  | GatherItemStep
  | ProcessItemStep
  | CraftRecipeStep
  | MarketListItemStep
  | MarketBuyItemStep
  | FightWinStep;

export interface QuestDef {
  readonly id: QuestId;
  readonly title: string;
  readonly icon?: string;
  readonly description: string;
  readonly repeat: QuestRepeat;
  readonly difficulty: QuestDifficulty;
  readonly prerequisites?: QuestPrerequisites;
  readonly steps: readonly QuestStep[];
  readonly rewards: QuestRewards;
  readonly enabled?: boolean;
}

export interface QuestlineDef {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly questIds: readonly QuestId[];
}

export type QuestEvent =
  | {
      readonly type: "gather";
      readonly guildId: GuildId;
      readonly userId: UserId;
      readonly action: "mine" | "forest";
      readonly itemId: string;
      readonly qty: number;
      readonly locationTier?: number;
      readonly toolTier?: number;
      readonly correlationId?: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: "process";
      readonly guildId: GuildId;
      readonly userId: UserId;
      readonly inputItemId: string;
      readonly outputItemId?: string;
      readonly qty: number;
      readonly success: boolean;
      readonly correlationId?: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: "craft";
      readonly guildId: GuildId;
      readonly userId: UserId;
      readonly recipeId: string;
      readonly qty: number;
      readonly correlationId?: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: "market_list";
      readonly guildId: GuildId;
      readonly userId: UserId;
      readonly itemId: string;
      readonly qty: number;
      readonly correlationId?: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: "market_buy";
      readonly guildId: GuildId;
      readonly userId: UserId;
      readonly itemId: string;
      readonly qty: number;
      readonly correlationId?: string;
      readonly timestamp: Date;
    }
  | {
      readonly type: "fight_win";
      readonly guildId: GuildId;
      readonly userId: UserId;
      readonly opponentId: UserId;
      readonly correlationId?: string;
      readonly timestamp: Date;
    };

export interface QuestStepProgress {
  readonly current: number;
  readonly target: number;
  readonly done: boolean;
  readonly label: string;
}

export interface ActiveQuestState {
  readonly questId: QuestId;
  readonly stepProgress: number[];
  readonly acceptedAt: Date;
  readonly completedAt?: Date;
  readonly claimedAt?: Date;
  readonly claimCorrelationId?: string;
  readonly claimInFlight?: {
    readonly correlationId: string;
    readonly startedAt: Date;
  };
}

export interface QuestHistoryState {
  readonly completedCount: number;
  readonly lastCompletedAt?: Date;
  readonly lastClaimedAt?: Date;
  readonly lastClaimCorrelationId?: string;
}

export interface QuestProgressDoc {
  readonly _id: string;
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly active: Record<string, ActiveQuestState>;
  readonly history: Record<string, QuestHistoryState>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type QuestClaimErrorCode =
  | "QUEST_NOT_FOUND"
  | "QUEST_DISABLED"
  | "PREREQUISITES_NOT_MET"
  | "QUEST_ALREADY_ACCEPTED"
  | "QUEST_NOT_ACCEPTED"
  | "QUEST_NOT_COMPLETED"
  | "REWARDS_ALREADY_CLAIMED"
  | "CLAIM_IN_PROGRESS"
  | "COOLDOWN_ACTIVE"
  | "CAPACITY_EXCEEDED"
  | "UPDATE_FAILED";

export class QuestClaimError extends Error {
  constructor(
    public readonly code: QuestClaimErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuestClaimError";
  }
}

export interface QuestBrowseView {
  readonly available: QuestDef[];
  readonly active: Array<{
    readonly quest: QuestDef;
    readonly steps: QuestStepProgress[];
    readonly completed: boolean;
    readonly claimed: boolean;
    readonly acceptedAt: Date;
    readonly completedAt?: Date;
  }>;
}

export interface QuestClaimResult {
  readonly questId: string;
  readonly correlationId: string;
  readonly appliedRewards: Array<{
    readonly type: "currency" | "xp" | "item" | "token";
    readonly id?: string;
    readonly amount: number;
  }>;
}
