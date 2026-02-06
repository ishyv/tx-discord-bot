# Phase 12 Codebase Reconnaissance

> **Date**: 2026-02-05
> **Purpose**: Map existing modules and patterns before implementing Phase 12 (Fun Layer)

---

## Executive Summary

This document identifies existing modules, patterns, and infrastructure that Phase 12 will reuse. The goal is to avoid duplication and ensure consistency with established patterns.

---

## Existing Modules to Reuse

### 1. Quest System (`src/modules/economy/quests/`)

**Status**: Fully implemented and mature  
**Reusable for**: Starter questline, RPG tutorial quests

| File            | Purpose                            | Reuse Plan                                     |
| --------------- | ---------------------------------- | ---------------------------------------------- |
| `types.ts`      | Quest templates, progress, rewards | **Extend** with RPG-specific requirement types |
| `service.ts`    | Progress tracking, reward claiming | **Reuse** for RPG quest flow                   |
| `repository.ts` | MongoDB persistence                | **Reuse** as-is                                |
| `rotation.ts`   | Daily/weekly quest rotation        | **Reuse** rotation mechanism for RPG quests    |
| `hooks.ts`      | Event hooks for quest progress     | **Extend** with RPG-specific hooks             |

**Existing Quest Requirement Types**:

- `do_command` - Execute a command N times
- `spend_currency` - Spend N amount of currency
- `craft_recipe` - Craft a recipe N times
- `win_minigame` - Win a minigame N times
- `vote_cast` - Cast N votes

**New Requirement Types Needed for RPG**:

- `rpg_equip` - Equip an item
- `rpg_gather` - Gather N materials
- `rpg_process` - Process N materials
- `rpg_upgrade` - Upgrade a tool
- `rpg_fight` - Complete a fight

**Quest Categories** (existing): `general`, `economy`, `social`, `minigame`, `crafting`, `voting`, `exploration`, `event`, `starter`

---

### 2. Event System (`src/modules/economy/events/`)

**Status**: Fully implemented  
**Reusable for**: Weekly RPG event modifiers

| File             | Purpose                 | Reuse Plan                             |
| ---------------- | ----------------------- | -------------------------------------- |
| `types.ts`       | Event modifiers, config | **Extend** with RPG-specific modifiers |
| `service.ts`     | Event start/stop logic  | **Reuse** event lifecycle              |
| `repository.ts`  | Event persistence       | **Reuse** as-is                        |
| `launch-pack.ts` | Preset events           | **Add** RPG event presets              |

**Existing Event Modifiers**:

```typescript
interface EventModifiers {
  xpMultiplier: number; // Covers XP bonus
  dailyRewardBonusPct: number;
  workRewardBonusPct: number;
  triviaRewardBonusPct: number;
  storeDiscountPct: number;
  questRewardBonusPct: number;
  craftingCostReductionPct: number;
}
```

**New RPG Modifiers Needed**:

```typescript
// Add to EventModifiers
rpgGatherYieldBonus?: number;      // +yield%
rpgDurabilityReduction?: number;   // -durability loss%
rpgCritBonus?: number;             // +crit chance%
rpgProcessSuccessBonus?: number;   // +processing success%
```

---

### 3. UI Design System (`src/modules/ui/`)

**Status**: Comprehensive design system established  
**Reusable for**: All Phase 12 embeds and views

| File               | Purpose                  | Reuse Plan                      |
| ------------------ | ------------------------ | ------------------------------- |
| `design-system.ts` | Colors, emotes, builders | **Reuse** all builders          |
| `colors.ts`        | UI color constants       | **Use** `UIColors`              |
| `sessions.ts`      | UI session management    | **Reuse** for interactive flows |

**Key Utilities to Use**:

- `UIColors` - Semantic color palette (success, error, warning, gold, etc.)
- `Emoji` - Standard emoji set (success/error icons, progress bars)
- `buildSuccessEmbed()`, `buildErrorEmbed()`, `buildWarningEmbed()`, `buildInfoEmbed()`
- `renderProgressBar()` - For durability bars
- `createConfirmCancelRow()` - For equip confirmation buttons
- `createPaginationRow()` - For inventory pagination
- `formatDelta()` - For stat change previews (+ATK, -DEF)
- `formatCoins()`, `formatNumber()`, `formatLevel()`

---

### 4. RPG Views (`src/modules/rpg/views/`)

**Status**: Basic embeds implemented  
**Needs enhancement for**: Combat round cards, progression moments

| File            | Purpose                           | Enhancement Plan                       |
| --------------- | --------------------------------- | -------------------------------------- |
| `embeds.ts`     | Profile, combat, gathering embeds | **Extend** with round cards, XP popups |
| `hp-bar.ts`     | HP bar renderer                   | **Reuse** for combat display           |
| `combat-log.ts` | Combat log formatter              | **Enhance** for round summaries        |

**Existing Embed Functions**:

- `createProfileEmbed()` - Profile display
- `createCombatInviteEmbed()` - Fight invitation
- `createCombatStatusEmbed()` - Fight status with HP bars
- `createCombatResultEmbed()` - Fight result
- `createGatheringEmbed()` - Gathering result
- `createProcessingEmbed()` - Processing result
- `createUpgradeEmbed()` - Upgrade result

**New Views Needed**:

- `createOnboardingEmbed()` - Starter kit selection
- `createRoundCardEmbed()` - Combat round summary
- `createWaitingStateEmbed()` - Who hasn't moved yet
- `createLevelUpEmbed()` - Level up celebration
- `createXpGainEmbed()` - XP feedback line
- `createRareDropEmbed()` - Rare drop notification
- `createEventStatusEmbed()` - Current event display
- `createQuestProgressEmbed()` - Quest step tracker

---

### 5. RPG Config System (`src/modules/rpg/config/`)

**Status**: Fully implemented with audit support  
**Needs extension for**: Onboarding, progression, events

| File          | Current Keys                            | Extension Plan                                   |
| ------------- | --------------------------------------- | ------------------------------------------------ |
| `types.ts`    | combat, processing, gathering, upgrades | **Add** onboarding, progression, events sections |
| `defaults.ts` | Default values                          | **Add** onboarding/progression defaults          |
| `service.ts`  | Config CRUD with audit                  | **Add** new section update methods               |

**New Config Sections Needed**:

```typescript
// Add to RpgConfig
onboarding?: {
  enabled: boolean;
  starterKits: {
    miner: { toolId: string; gear: Array<{id: string; qty: number}> };
    lumber: { toolId: string; gear: Array<{id: string; qty: number}> };
  };
  oncePerGuild?: boolean;
};

progression?: {
  streakEnabled: boolean;
  streakXpBonusPerDay: number;
  streakMaxBonus: number;
  graceDays: number;
  levelUpRewardEnabled: boolean;
  levelUpRewardItems?: Array<{id: string; qty: number}>;
};

rareDrops?: {
  miningGemChance: number;       // Default: 0.01 (1%)
  processingPerfectChance: number; // Default: 0.02 (2%)
};
```

---

### 6. Audit System (`src/modules/economy/audit/`)

**Status**: Fully implemented  
**Reusable for**: All Phase 12 operations

**Existing Operation Types**:

```typescript
type OperationType =
  | "currency_adjust"
  | "currency_transfer"
  | "item_grant"
  | "item_remove"
  | "item_purchase"
  | "item_sell"
  | "item_equip"
  | "item_unequip"
  | "config_update"
  | "daily_claim"
  | "work_claim"
  | "perk_purchase"
  | "xp_grant"
  | "rollback";
```

**New Operation Types Needed**:

- `rpg_starter_kit` - Starter kit claimed
- `rpg_quest_complete` - RPG quest completed
- `rpg_level_up` - Level up occurred
- `rpg_rare_drop` - Rare item dropped
- `rpg_event_start` - RPG event started
- `rpg_event_stop` - RPG event stopped
- `rpg_streak_update` - Streak milestone

**Audit Pattern to Follow**:

```typescript
await economyAuditRepo.create({
  operationType: "rpg_starter_kit",
  actorId: userId,
  targetId: userId,
  guildId,
  source: "rpg_onboarding",
  reason: "Claimed miner starter kit",
  metadata: {
    correlationId,
    kitId: "miner",
    grantedItems: [...]
  }
});
```

---

### 7. RPG Profile Schema (`src/db/schemas/rpg-profile.ts`)

**Status**: Implemented with loadout, combat stats  
**Needs extension for**: Onboarding tracking, progression tracking

**Current Schema**:

```typescript
RpgProfileSchema = z.object({
  loadout: LoadoutSchema, // 8 equipment slots
  hpCurrent: z.number(), // Current HP
  wins: z.number(), // Combat wins
  losses: z.number(), // Combat losses
  isFighting: z.boolean(), // Combat lock
  activeFightId: z.string().nullable(),
  createdAt: DateSchema,
  updatedAt: DateSchema,
  version: z.number(),
});
```

**New Fields Needed**:

```typescript
// Add to RpgProfileSchema
starterKitClaimedAt?: Date | null;   // One-time claim tracking
starterKitType?: "miner" | "lumber" | null;

// Progression tracking
xp?: number;                  // Total XP earned
level?: number;               // Current level

// Streak tracking
activity?: {
  lastActiveAt: Date;
  dailyActionCount: number;
  streak: number;
  longestStreak: number;
};
```

---

### 8. Inventory & Item Mutation (`src/modules/inventory/`, `src/modules/economy/mutations/items/`)

**Status**: Fully implemented with instance support  
**Reusable for**: Starter kit grants, reward distribution

**Key Functions**:

```typescript
// Grant items (instanced or stackable)
await itemMutationService.adjustItemQuantity(
  {
    actorId,
    targetId,
    guildId,
    itemId,
    delta: +1,
    reason: "starter_kit_grant",
  },
  capacityChecker,
);

// Remove items
await itemMutationService.adjustItemQuantity(
  {
    actorId,
    targetId,
    guildId,
    itemId,
    delta: -1,
    reason: "crafting_consumed",
  },
  capacityChecker,
);
```

---

### 9. Ops System (`src/modules/ops/`)

**Status**: Implemented for startup assertions, scheduled reports  
**Reusable for**: Event scheduling, automated expiry

| File                    | Purpose                 | Reuse Plan                         |
| ----------------------- | ----------------------- | ---------------------------------- |
| `scheduled-reports.ts`  | Periodic task execution | **Extend** for event expiry checks |
| `startup-assertions.ts` | Initialization checks   | **Add** RPG event cleanup          |
| `presets.ts`            | Feature presets         | **Add** RPG event presets          |

---

## Existing RPG Commands

| Command             | File                 | Enhancement Plan                  |
| ------------------- | -------------------- | --------------------------------- |
| `/rpg profile`      | `profile.command.ts` | Add onboarding trigger            |
| `/rpg equip`        | `equip.command.ts`   | Add preview + confirm flow        |
| `/rpg unequip`      | `unequip.command.ts` | Minor polish                      |
| `/rpg loadout`      | `loadout.ts`         | Show computed stats + HP status   |
| `/rpg mine`         | `mine.ts`            | Add XP feedback, rare drops       |
| `/rpg cutdown`      | `cutdown.ts`         | Add XP feedback, rare drops       |
| `/rpg process`      | `process.ts`         | Add XP feedback, perfect chance   |
| `/rpg upgrade-tool` | `upgrade-tool.ts`    | Add XP feedback                   |
| `/rpg fight`        | `fight.ts`           | Add round cards, timeout handling |

**New Commands Needed**:

- `/rpg start` - Alternative onboarding entry point
- `/rpg quests` - View RPG questline progress
- `/rpg event` - View current RPG event
- `/rpg fight status` - View fight pending moves

---

## Implementation Order Summary

Based on this reconnaissance, the implementation order should be:

1. **12.1 Onboarding + Starter Kit**
   - Extend `RpgConfig` with onboarding section
   - Add `starterKitClaimedAt` to profile schema
   - Create onboarding flow + kit grant logic

2. **12.2 Inventory & Equip UI**
   - Extend inventory command with filters
   - Add preview + confirm to equip flow
   - Show durability bars using `renderProgressBar()`

3. **12.3 Combat UX**
   - Create round card embed builder
   - Add waiting state display
   - Implement timeout auto-submit

4. **12.4 Progression Moments**
   - Add XP/level fields to profile
   - Create XP feedback helpers
   - Implement streak tracking

5. **12.5 Starter Questline**
   - Extend quest requirement types
   - Create RPG tutorial quest templates
   - Hook progress updates into RPG services

6. **12.6 Rare Drops**
   - Add drop tables to gathering config
   - Implement drop logic in gathering service
   - Create rare drop notification view

7. **12.7 Weekly Events**
   - Extend `EventModifiers` with RPG fields
   - Add RPG event presets
   - Create `/rpg event` command

---

## Dependencies (No New External Packages Needed)

All Phase 12 features can be built using existing dependencies:

- `zod` - Schema validation
- `seyfert` - Discord bot framework
- MongoDB via `MongoStore` - Persistence

---

## Notes for Implementation

1. **Audit Convention**: All RPG operations use `correlationId` for tracing
2. **Config Changes**: Use `rpgConfigService` methods (auto-audits)
3. **UI Colors**: Always use `UIColors` from design system
4. **Error Pattern**: Return `Result<T, RpgError>` from services
5. **Instance Items**: Tools are instance-based with durability; materials are stackable

---

_Document complete. Ready to proceed with Phase 12.1 implementation._
