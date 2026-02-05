/**
 * Zod schema for guild documents.
 * Purpose: single definition of guild shape/defaults to validate repo reads/writes.
 */
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_PROVIDER_ID,
} from "@/services/ai/constants";
import { z } from "zod";

// Economy sector enum for Zod
const EconomySectorEnum = z.union([
  z.literal("global"),
  z.literal("works"),
  z.literal("trade"),
  z.literal("tax"),
]);

// Daily config schema (with fee fields)
export const DailyConfigSchema = z.object({
  dailyReward: z.number().int().catch(250),
  dailyCooldownHours: z.number().int().catch(24),
  dailyCurrencyId: z.string().catch("coins"),
  dailyFeeRate: z.number().min(0).max(0.2).catch(0.0),
  dailyFeeSector: EconomySectorEnum.catch(() => "tax" as const),
  dailyStreakBonus: z.number().int().min(0).catch(5),
  dailyStreakCap: z.number().int().min(0).catch(10),
});

// Work config schema (Hybrid payout model: minted base + treasury-funded bonus)
export const WorkConfigSchema = z.object({
  workRewardBase: z.number().int().catch(120),
  workBaseMintReward: z.number().int().min(0).catch(100),
  workBonusFromWorksMax: z.number().int().min(0).catch(100),
  workBonusScaleMode: z.enum(["flat", "percent"]).catch("flat"),
  workCooldownMinutes: z.number().int().catch(30),
  workDailyCap: z.number().int().catch(5),
  workCurrencyId: z.string().catch("coins"),
  workPaysFromSector: EconomySectorEnum.catch(() => "works" as const),
  workFailureChance: z.number().min(0).max(1).catch(0.1),
});

// Store item schema
export const StoreItemSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  buyPrice: z.number().min(0),
  sellPrice: z.number().min(0),
  stock: z.number(),
  available: z.boolean(),
  description: z.string().optional(),
  category: z.string().optional(),
  purchaseLimit: z.number().optional(),
  requiredRole: z.string().optional(),
});

// Store catalog schema
export const StoreCatalogDataSchema = z.object({
  currencyId: z.string().catch("coin"),
  items: z.record(z.string(), StoreItemSchema).catch(() => ({})),
  active: z.boolean().catch(true),
  taxRate: z.number().min(0).max(1).catch(0.05),
  updatedAt: z.preprocess((val) => (typeof val === "string" ? new Date(val) : val), z.date()).catch(() => new Date()),
  version: z.number().catch(0),
});

export enum Features {
  Tickets = "tickets",
  Automod = "automod",
  Autoroles = "autoroles",
  Warns = "warns",
  Roles = "roles",
  Reputation = "reputation",
  ReputationDetection = "reputationDetection",
  Tops = "tops",
  Suggest = "suggest",
  Economy = "economy",
  Game = "game",
}

export type RoleCapabilityKey = string;
export type RoleCommandOverride = "inherit" | "allow" | "deny";
export type RoleCommandOverrideMap = Record<
  RoleCapabilityKey,
  RoleCommandOverride
>;
export type LimitWindow = `${number}${"m" | "h" | "d"}`;

export interface RoleLimitRecord {
  limit: number;
  window: LimitWindow | null;
  windowSeconds?: number | null;
}

export type RoleLimitMap = Partial<Record<RoleCapabilityKey, RoleLimitRecord>>;

export interface GuildRoleRecord {
  label: string;
  discordRoleId: string | null;
  limits: RoleLimitMap;
  reach: RoleCommandOverrideMap;
  updatedBy: string | null;
  updatedAt: string | null;
}

export type GuildRolesRecord = Record<string, GuildRoleRecord>;

export const DEFAULT_GUILD_FEATURES: Readonly<Record<Features, boolean>> =
  Object.freeze(
    Object.values(Features).reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {} as Record<Features, boolean>,
    ),
  );

const defaultCoreChannels = () => ({
  welcome: null,
  goodbye: null,
  logs: null,
  reports: null,
  suggestions: null,
  tickets: null,
});

const defaultGuildChannels = () => ({
  core: defaultCoreChannels(),
  managed: {},
  ticketMessageId: null,
  ticketHelperRoles: [],
  ticketCategoryId: null,
});

export const CoreChannelSchema = z.object({
  channelId: z.string(),
});

export const ManagedChannelSchema = z.object({
  id: z.string(),
  label: z.string(),
  channelId: z.string(),
});

export const GuildChannelsSchema = z.object({
  core: z
    .record(z.string(), CoreChannelSchema.nullable())
    .catch(() => defaultCoreChannels()),
  managed: z.record(z.string(), ManagedChannelSchema).catch(() => ({})),
  ticketMessageId: z.string().nullable().catch(null),
  ticketHelperRoles: z.array(z.string()).catch(() => []),
  ticketCategoryId: z.string().nullable().catch(null),
});

export const GuildFeaturesSchema = z
  .record(z.string(), z.boolean())
  .catch(() => DEFAULT_GUILD_FEATURES);
export const GuildRolesSchema = z.record(z.string(), z.any()).catch(() => ({}));

export const ForumAutoReplySchema = z.object({
  forumIds: z.array(z.string()).catch(() => []),
});

export const AiConfigSchema = z.object({
  provider: z.string().catch(DEFAULT_PROVIDER_ID),
  model: z.string().catch(DEFAULT_GEMINI_MODEL),
});

// RPG Configuration Schemas
export const RpgCombatConfigSchema = z.object({
  critChance: z.number().min(0).max(1).catch(0.15),
  blockChance: z.number().min(0).max(1).catch(0.25),
  varianceMin: z.number().min(0).max(1).catch(0.85),
  varianceMax: z.number().min(0).max(1).catch(1.15),
  defenseReductionMin: z.number().min(0).max(1).catch(0.1),
  defenseReductionMax: z.number().min(0).max(1).catch(0.5),
  timeoutSeconds: z.number().int().min(30).catch(300),
});

export const RpgProcessingConfigSchema = z.object({
  baseSuccessChance: z.number().min(0).max(1).catch(0.6),
  luckCap: z.number().min(0).max(1).catch(0.25),
  feePercent: z.number().min(0).max(1).catch(0.05),
  minFee: z.number().int().min(0).catch(5),
  maxFee: z.number().int().min(0).catch(100),
});

export const RpgGatheringConfigSchema = z.object({
  durabilityMin: z.number().int().min(1).catch(8),
  durabilityMax: z.number().int().min(1).catch(12),
  yieldMin: z.number().int().min(1).catch(1),
  yieldMax: z.number().int().min(1).catch(3),
  tierBonusPerLevel: z.number().min(0).catch(0.5),
});

export const RpgUpgradeConfigSchema = z.object({
  costs: z.record(z.string(), z.object({
    money: z.number().int().min(0),
    materials: z.array(z.object({
      id: z.string(),
      quantity: z.number().int().min(1),
    })),
  })).catch(() => ({
    tier2: { money: 500, materials: [{ id: "iron_ore", quantity: 5 }] },
    tier3: { money: 2000, materials: [{ id: "silver_ore", quantity: 5 }] },
    tier4: { money: 10000, materials: [{ id: "gold_ore", quantity: 5 }] },
  })),
  maxTier: z.number().int().min(1).max(10).catch(4),
  resetDurabilityOnUpgrade: z.boolean().catch(true),
});

export const RpgConfigSchema = z.object({
  enabled: z.boolean().catch(true),
  combat: RpgCombatConfigSchema.catch(() => ({
    critChance: 0.15,
    blockChance: 0.25,
    varianceMin: 0.85,
    varianceMax: 1.15,
    defenseReductionMin: 0.1,
    defenseReductionMax: 0.5,
    timeoutSeconds: 300,
  })),
  processing: RpgProcessingConfigSchema.catch(() => ({
    baseSuccessChance: 0.6,
    luckCap: 0.25,
    feePercent: 0.05,
    minFee: 5,
    maxFee: 100,
  })),
  gathering: RpgGatheringConfigSchema.catch(() => ({
    durabilityMin: 8,
    durabilityMax: 12,
    yieldMin: 1,
    yieldMax: 3,
    tierBonusPerLevel: 0.5,
  })),
  upgrades: RpgUpgradeConfigSchema.catch(() => ({
    costs: {
      tier2: { money: 500, materials: [{ id: "iron_ore", quantity: 5 }] },
      tier3: { money: 2000, materials: [{ id: "silver_ore", quantity: 5 }] },
      tier4: { money: 10000, materials: [{ id: "gold_ore", quantity: 5 }] },
    },
    maxTier: 4,
    resetDurabilityOnUpgrade: true,
  })),
  updatedAt: z.preprocess((val) => (typeof val === "string" ? new Date(val) : val), z.date()).catch(() => new Date()),
});

export const LinkSpamSchema = z.object({
  enabled: z.boolean().catch(false),
  maxLinks: z.number().int().catch(4),
  windowSeconds: z.number().int().catch(10),
  timeoutSeconds: z.number().int().catch(300),
  action: z.enum(["timeout", "mute", "delete", "report"]).catch("timeout"),
  reportChannelId: z.string().nullable().catch(null),
});

export const DomainWhitelistSchema = z.object({
  enabled: z.boolean().catch(false),
  domains: z.array(z.string()).catch(() => []),
});

export const ShortenersSchema = z.object({
  enabled: z.boolean().catch(false),
  resolveFinalUrl: z.boolean().catch(false),
  allowedShorteners: z
    .array(z.string())
    .catch(() => [
      "bit.ly",
      "t.co",
      "tinyurl.com",
      "cutt.ly",
      "is.gd",
      "rebrand.ly",
      "goo.gl",
    ]),
});

export const AutomodSchema = z
  .object({
    linkSpam: LinkSpamSchema.catch(() => ({
      enabled: false,
      maxLinks: 4,
      windowSeconds: 10,
      timeoutSeconds: 300,
      action: "timeout" as const,
      reportChannelId: null,
    })),
    domainWhitelist: DomainWhitelistSchema.catch(() => ({
      enabled: false,
      domains: [],
    })),
    shorteners: ShortenersSchema.catch(() => ({
      enabled: false,
      resolveFinalUrl: false,
      allowedShorteners: [
        "bit.ly",
        "t.co",
        "tinyurl.com",
        "cutt.ly",
        "is.gd",
        "rebrand.ly",
        "goo.gl",
      ],
    })),
  })
  .catch(() => ({
    linkSpam: {
      enabled: false,
      maxLinks: 4,
      windowSeconds: 10,
      timeoutSeconds: 300,
      action: "timeout" as const,
      reportChannelId: null,
    },
    domainWhitelist: {
      enabled: false,
      domains: [],
    },
    shorteners: {
      enabled: false,
      resolveFinalUrl: false,
      allowedShorteners: [
        "bit.ly",
        "t.co",
        "tinyurl.com",
        "cutt.ly",
        "is.gd",
        "rebrand.ly",
        "goo.gl",
      ],
    },
  }));

export const GuildSchema = z.object({
  _id: z.string(),
  roles: GuildRolesSchema,
  channels: GuildChannelsSchema.catch(() => defaultGuildChannels()),
  pendingTickets: z.array(z.string()).catch(() => []),
  features: GuildFeaturesSchema,
  forumAutoReply: ForumAutoReplySchema.catch(() => ({ forumIds: [] })),
  ai: AiConfigSchema.catch(() => ({
    provider: "gemini",
    model: "gemini-2.5-flash",
  })),
  reputation: z
    .object({
      keywords: z.array(z.string()).catch(() => []),
    })
    .catch(() => ({ keywords: [] })),
  automod: AutomodSchema.catch(() => ({
    linkSpam: {
      enabled: false,
      maxLinks: 4,
      windowSeconds: 10,
      timeoutSeconds: 300,
      action: "timeout" as const,
      reportChannelId: null,
    },
    domainWhitelist: {
      enabled: false,
      domains: [],
    },
    shorteners: {
      enabled: false,
      resolveFinalUrl: false,
      allowedShorteners: [
        "bit.ly",
        "t.co",
        "tinyurl.com",
        "cutt.ly",
        "is.gd",
        "rebrand.ly",
        "goo.gl",
      ],
    },
  })),
  rpg: RpgConfigSchema.catch(() => ({
    enabled: true,
    combat: {
      critChance: 0.15,
      blockChance: 0.25,
      varianceMin: 0.85,
      varianceMax: 1.15,
      defenseReductionMin: 0.1,
      defenseReductionMax: 0.5,
      timeoutSeconds: 300,
    },
    processing: {
      baseSuccessChance: 0.6,
      luckCap: 0.25,
      feePercent: 0.05,
      minFee: 5,
      maxFee: 100,
    },
    gathering: {
      durabilityMin: 8,
      durabilityMax: 12,
      yieldMin: 1,
      yieldMax: 3,
      tierBonusPerLevel: 0.5,
    },
    upgrades: {
      costs: {
        tier2: { money: 500, materials: [{ id: "iron_ore", quantity: 5 }] },
        tier3: { money: 2000, materials: [{ id: "silver_ore", quantity: 5 }] },
        tier4: { money: 10000, materials: [{ id: "gold_ore", quantity: 5 }] },
      },
      maxTier: 4,
      resetDurabilityOnUpgrade: true,
    },
    updatedAt: new Date(),
  })),
  // ...existing fields...
  crafting: z
    .object({
      recipes: z
        .record(z.string(), z.any())
        .optional()
        .catch(() => ({})),
      updatedAt: z
        .string()
        .optional()
        .catch(() => new Date().toISOString()),
    })
    .optional()
    .catch(() => ({ recipes: {}, updatedAt: new Date().toISOString() })),
  minigames: z
    .object({
      coinflip: z.any().optional(),
      trivia: z.any().optional(),
      rob: z.any().optional(),
      updatedAt: z.string().optional(),
    })
    .optional()
    .catch(() => ({})),
  voting: z
    .object({
      enabled: z.boolean().optional(),
      cooldownSeconds: z.number().optional(),
      dailyMaxVotes: z.number().optional(),
      repeatCooldownHours: z.number().optional(),
      allowOptOut: z.boolean().optional(),
      defaultOptOut: z.boolean().optional(),
      showInProfile: z.boolean().optional(),
      allowBotTargets: z.boolean().optional(),
      updatedAt: z.string().optional(),
    })
    .optional()
    .catch(() => ({})),
  economy: z
    .object({
      features: z
        .object({
          coinflip: z.boolean().catch(true),
          trivia: z.boolean().catch(true),
          rob: z.boolean().catch(true),
          voting: z.boolean().catch(true),
          crafting: z.boolean().catch(true),
          store: z.boolean().catch(true),
        })
        .optional()
        .catch(() => ({
          coinflip: true,
          trivia: true,
          rob: true,
          voting: true,
          crafting: true,
          store: true,
        })),
      daily: DailyConfigSchema.catch(() => ({
        dailyReward: 250,
        dailyCooldownHours: 24,
        dailyCurrencyId: "coins",
        dailyFeeRate: 0.0,
        dailyFeeSector: "tax" as const,
        dailyStreakBonus: 5,
        dailyStreakCap: 10,
      })),
      work: WorkConfigSchema.catch(() => ({
        workRewardBase: 120,
        workBaseMintReward: 100,
        workBonusFromWorksMax: 100,
        workBonusScaleMode: "flat" as const,
        workCooldownMinutes: 30,
        workDailyCap: 5,
        workCurrencyId: "coins",
        workPaysFromSector: "works" as const,
        workFailureChance: 0.1,
      })),
      progression: z
        .object({
          enabled: z.boolean().catch(true),
          xpAmounts: z.object({
            daily_claim: z.number().int().min(0).catch(60),
            work_claim: z.number().int().min(0).catch(25),
            store_buy: z.number().int().min(0).catch(15),
            store_sell: z.number().int().min(0).catch(10),
            quest_complete: z.number().int().min(0).catch(120),
            craft: z.number().int().min(0).catch(10),
          }),
          cooldownSeconds: z.object({
            daily_claim: z.number().int().min(0).catch(0),
            work_claim: z.number().int().min(0).catch(0),
            store_buy: z.number().int().min(0).catch(15),
            store_sell: z.number().int().min(0).catch(15),
            quest_complete: z.number().int().min(0).catch(0),
            craft: z.number().int().min(0).catch(0),
          }),
        })
        .partial()
        .optional()
        .catch(() => ({
          enabled: true,
          xpAmounts: {
            daily_claim: 60,
            work_claim: 25,
            store_buy: 15,
            store_sell: 10,
            quest_complete: 120,
            craft: 10,
          },
          cooldownSeconds: {
            daily_claim: 0,
            work_claim: 0,
            store_buy: 15,
            store_sell: 15,
            quest_complete: 0,
            craft: 0,
          },
        })),
      // Economy sectors for guild treasury
      sectors: z
        .object({
          global: z.number().catch(0),
          works: z.number().catch(0),
          trade: z.number().catch(0),
          tax: z.number().catch(0),
        })
        .optional()
        .catch(() => ({ global: 0, works: 0, trade: 0, tax: 0 })),
      // ...other economy config fields (if any) can be added here...
    })
    .catch(() => ({
      daily: {
        dailyReward: 250,
        dailyCooldownHours: 24,
        dailyCurrencyId: "coins",
        dailyFeeRate: 0.0,
        dailyFeeSector: "tax" as const,
        dailyStreakBonus: 5,
        dailyStreakCap: 10,
      },
      work: {
        workRewardBase: 120,
        workBaseMintReward: 100,
        workBonusFromWorksMax: 100,
        workBonusScaleMode: "flat" as const,
        workCooldownMinutes: 30,
        workDailyCap: 5,
        workCurrencyId: "coins",
        workPaysFromSector: "works" as const,
        workFailureChance: 0.1,
      },
      progression: {
        enabled: true,
        xpAmounts: {
          daily_claim: 60,
          work_claim: 25,
          store_buy: 15,
          store_sell: 10,
          quest_complete: 120,
          craft: 10,
        },
        cooldownSeconds: {
          daily_claim: 0,
          work_claim: 0,
          store_buy: 15,
          store_sell: 15,
          quest_complete: 0,
          craft: 0,
        },
      },
    })),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  store: StoreCatalogDataSchema.optional(),
});

export type Guild = z.infer<typeof GuildSchema>;
export type GuildChannelsRecord = z.infer<typeof GuildChannelsSchema>;
export type GuildFeaturesRecord = z.infer<typeof GuildFeaturesSchema>;
export type CoreChannelRecord = z.infer<typeof CoreChannelSchema>;
export type ManagedChannelRecord = z.infer<typeof ManagedChannelSchema>;
export type ForumAutoReplyRecord = z.infer<typeof ForumAutoReplySchema>;
export type AiConfigRecord = z.infer<typeof AiConfigSchema>;
export type RpgConfigRecord = z.infer<typeof RpgConfigSchema>;
export type RpgCombatConfig = z.infer<typeof RpgCombatConfigSchema>;
export type RpgProcessingConfig = z.infer<typeof RpgProcessingConfigSchema>;
export type RpgGatheringConfig = z.infer<typeof RpgGatheringConfigSchema>;
export type RpgUpgradeConfig = z.infer<typeof RpgUpgradeConfigSchema>;
