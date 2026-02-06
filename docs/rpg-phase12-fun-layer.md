# RPG Phase 12: Fun Layer Implementation

**Status:** In Progress  
**Phases Complete:** 12.1-12.3 (Onboarding, Inventory UX, Equipment UX, Combat UX)  
**Phases Remaining:** 12.4-12.7

## Overview

Phase 12 adds the "fun layer" to the RPG system, transforming it from functional mechanics into an engaging gameplay loop:

- **12.4 Progression + Streak**: XP feedback, level-ups, daily activity rewards
- **12.5 Starter Questline**: Guided tutorial teaching the core loop
- **12.6 Rare Drops + Cosmetics**: Excitement moments without power creep
- **12.7 Weekly Events**: Server rhythm with temporary modifiers

## Architecture Principles

### Shared Primitives First

All phases share common UI builders, RNG utilities, and reward logic to avoid duplication.

### Deterministic Testing

All probabilistic mechanics use seeded RNG for reproducible test cases.

### Audit Trail

Every reward grant, XP gain, quest completion, and event activation is audited with consistent metadata.

### Config-Driven

All balance parameters and feature toggles live in guild RPG config.

## Phase 12.4: Progression Moments + Adventurer Streak

### Goals

- Show XP popups on RPG actions (gather, process, upgrade, fight)
- Display level-up moments with rewards
- Track daily activity streak for XP multipliers

### Data Model

#### RpgProfile Extensions

```typescript
{
  // Progression
  xp: number;
  level: number;

  // Activity tracking
  activity: {
    dayKey: string;           // "YYYY-MM-DD" in UTC
    actionsToday: number;
    streak: number;
    lastActiveAt: Date;
    lastStreakAt?: Date;
  };
}
```

### Config Keys

```typescript
guild.rpg.progression: {
  enabled: boolean;
  xpPerAction: {
    mine: number;
    cutdown: number;
    process: number;
    upgrade: number;
    fightWin: number;
    fightLoss: number;
  };
}

guild.rpg.streak: {
  enabled: boolean;
  requiredActionsPerDay: number;  // default: 2
  xpBonusPerStreakDay: number;    // default: 0.02 (2%)
  maxXpBonus: number;              // default: 0.50 (50% cap)
  graceDays: number;               // default: 0
}
```

### Services

#### RpgProgressionService

- `recordAction(guildId, userId, actionType, correlationId)`: Increment daily actions, update streak
- `computeXpMultiplier(user)`: Calculate streak bonus
- `awardXp(guildId, userId, baseAmount, reason, correlationId)`: Award XP with streak multiplier, check level-up
- `getLevelFromXp(xp)`: Calculate level from XP curve

#### RpgRewardService

Unified service for all reward grants:

- `awardXp()`
- `grantItem()`
- `awardCurrency()` (if used)

### Audit Operations

```typescript
"rpg_xp_gain";
"rpg_level_up";
"rpg_streak_update";
```

### UI Patterns

```
+12 XP (x1.06 streak)
LEVEL UP 4 → 5
```

## Phase 12.5: Starter Questline

### Goals

- Add 8-12 tutorial quests teaching the loop
- Use existing economy/quests system
- Reward XP and starter items

### Quest Integration

Extend `economy/quests` with new requirement types:

```typescript
"rpg_equip";
"rpg_gather";
"rpg_process";
"rpg_upgrade";
"rpg_fight";
```

### Starter Questline Definition

```typescript
quests/starter-questline.ts
  - Quest 1: Equip any item
  - Quest 2: Gather 5 materials
  - Quest 3: Process 2 materials
  - Quest 4: Upgrade a tool
  - Quest 5: Start a fight
  - Quest 6: Win a fight
```

### Hooks

```typescript
rpg / quests / hooks.ts -
  onEquip() -
  onGather() -
  onProcess() -
  onUpgradeTool() -
  onFightComplete();
```

### Audit Operations

```typescript
"rpg_quest_progress";
"rpg_quest_complete";
```

## Phase 12.6: Rare Drops + Cosmetic Crafting

### Goals

- Add rarity drops during gathering/processing
- Cosmetic items (same stats as base, different appearance)

### Drop System

```typescript
guild.rpg.drops: {
  enabled: boolean;
  rates: {
    mine_tier2: { item: "gem_fragment", chance: 0.01 };
    process: { item: "perfect_ingot", chance: 0.05 };
  }
}
```

#### Drop Logic

- Use deterministic RNG: `createRng(seed from correlationId + actionIndex)`
- Roll on successful gathering/processing
- Store drop result in audit

### Cosmetic Model

Items with `cosmetic: true` and `cosmeticOf: baseItemId`:

```typescript
{
  id: "diamond_pickaxe_glowing",
  cosmeticOf: "diamond_pickaxe",
  stats: { /* identical to base */ }
}
```

### Crafting Recipes

```typescript
recipes:
  - gem_fragment + materials → cosmetic_weapon_skin_1
```

### Audit Operations

```typescript
"rpg_rare_drop";
"rpg_cosmetic_craft";
```

## Phase 12.7: Weekly Events

### Goals

- Guild-scoped events with temporary modifiers
- Auto-expire on read (no timers)
- Admin controls to start/stop

### Event Model

Extend `EventModifiers` type:

```typescript
{
  rpgGatherYieldBonus: number;
  rpgDurabilityReduction: number;
  rpgCritBonus: number;
  rpgProcessingSuccessBonus: number;
  rpgXpMultiplier: number;
}
```

### Event Presets

```typescript
events / rpg -
  presets.ts -
  "Double Durability Weekend" -
  "Gold Rush" -
  "Crit Festival";
```

### Commands

```
/rpg event start <preset>
/rpg event stop
/rpg event view
```

### Expiry Logic

Services check event status on every read:

```typescript
if (now > event.endsAt) {
  await stopEvent(); // audit expiry
}
```

### Audit Operations

```typescript
"rpg_event_start";
"rpg_event_stop";
"rpg_event_expire";
```

## Shared Primitives Layer

### UI Utilities (`src/modules/rpg/ui/`)

```typescript
formatInstanceTag(instanceId): string
renderBar(value, max, width, filled, empty): string
renderHpBar(hp, maxHp): string
renderDurabilityBar(cur, max): string
renderStatLine(stats): string
renderStatDelta(before, after): string
buildCompactEmbed(title, lines, footer?): Embed
buildErrorEmbed(errorCode, message): Embed
buildConfirmFlow(embed, confirmId, cancelId): components
```

### RNG Utilities (`src/modules/rpg/rng/`)

```typescript
makeActionRng(guildId, userId, correlationId, actionType, actionIndex): RngState
```

### Reward Service (`src/modules/rpg/rewards/`)

Single point for all XP/item/currency grants:

```typescript
RpgRewardService.awardXp();
RpgRewardService.grantItem();
RpgRewardService.awardCurrency();
```

## Testing Strategy

### Unit Tests

- UI renderers (bars, stat deltas, instance tags)
- Progression calculations (XP curves, streak multipliers)
- Drop roll logic (deterministic)
- Event modifier merging

### Integration Tests

- Quest progression end-to-end
- Streak across day rollover
- Level-up + reward grant
- Rare drop + audit linkage
- Event start → apply → expire → stop applying

## Migration Notes

### Guild Config

Add new sections to guild schema:

```json
{
  "rpg": {
    "progression": { ... },
    "streak": { ... },
    "quests": { ... },
    "drops": { ... },
    "events": { ... }
  }
}
```

### RPG Profile

Add fields for xp, level, activity tracking.

## Definition of Done

- [x] Phase 12.1-12.3 complete
- [ ] Shared UI/RNG/Reward primitives created
- [ ] Phase 12.4: Progression + Streak implemented and tested
- [ ] Phase 12.5: Starter questline defined and hooked
- [ ] Phase 12.6: Rare drops + cosmetic crafting functional
- [ ] Phase 12.7: Weekly events + admin controls working
- [ ] All new audit operation types added
- [ ] TypeScript builds cleanly
- [ ] Integration tests green
- [ ] Docs updated

## References

- KI: `rpg_phase12_architecture`
- Design system: `src/modules/ui/design-system.ts`
- Quest system: `src/modules/economy/quests/`
- Event system: `src/modules/economy/events/`
- Combat engine: `src/modules/rpg/combat/engine.ts` (RNG pattern reference)
