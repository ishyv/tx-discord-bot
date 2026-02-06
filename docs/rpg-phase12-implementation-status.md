# Phase 12 Implementation Summary

## What Has Been Created

### 1. Documentation

- **docs/rpg-phase12-fun-layer.md**: Complete architecture and design document for phases 12.4-12.7

### 2. Shared Primitives (Foundation Layer)

#### UI Utilities (`src/modules/rpg/ui/index.ts`)

- ✅ `formatInstanceTag()`: Format instance IDs
- ✅ `renderBar()`: Generic progress bars
- ✅ `renderHpBar()`: HP-specific bars
- ✅ `renderDurabilityBar()`: Durability bars
- ✅ `renderStatLine()`: Compact stat display
- ✅ `renderStatDelta()`: Before/after stat changes
- ✅ `buildCompactEmbed()`: Consistent embed builder
- ✅ `buildErrorEmbed()`: Error formatting
- ✅ `buildConfirmFlow()`: Preview + confirmation pattern
- ✅ `buildPagedSelect()`: Pagination helper

#### RNG Utilities (`src/modules/rpg/rng/index.ts`)

- ✅ `makeActionRng()`: Deterministic RNG from action parameters
- ✅ `makeSimpleRng()`: Test-friendly simple RNG
- ✅ `rollChance()`: Probability checks
- ✅ `pickRandom()`: Random array selection
- ✅ `rollInt()` / `rollFloat()`: Numeric rolls

#### Reward Service (`src/modules/rpg/rewards/service.ts`)

- ✅ `awardXp()`: XP grants with streak multipliers
- ✅ `grantItem()`: Item grants with audit
- ⚠️ **STUB**: Needs actual progression integration

## What Remains To Be Implemented

### Phase 12.4: Progression + Streak

**Status**: Foundation ready, needs implementation

**Required Work**:

1. **Extend RPG Profile Schema** (`db/schemas/rpg-profile.ts`):

   ```typescript
   {
     xp: number;
     level: number;
     activity: {
       dayKey: string;
       actionsToday: number;
       streak: number;
       lastActiveAt: Date;
     }
   }
   ```

2. **Add Config Keys** (`modules/rpg/config/guild-config.ts` or similar):

   ```typescript
   progression: {
     enabled: boolean;
     xpPerAction: {
       (mine, cutdown, process, upgrade, fightWin, fightLoss);
     }
   }
   streak: {
     enabled: boolean;
     requiredActionsPerDay: 2;
     xpBonusPerStreakDay: 0.02;
     maxXpBonus: 0.5;
   }
   ```

3. **Create Progression Service** (`modules/rpg/progression/service.ts`):
   - `recordAction()`: Track daily actions, update streak
   - `computeXpMultiplier()`: Calculate streak bonus
   - `calculateLevel()`: XP curve formula
   - `checkLevelUp()`: Detect level changes

4. **Hook Into Existing Services**:
   - `gathering/service.ts`: Call `recordAction("mine")` after successful gather
   - `processing/service.ts`: Call `recordAction("process")` after process
   - `upgrades/service.ts`: Call `recordAction("upgrade")` after upgrade
   - `combat/service.ts`: Call `recordAction("fightWin|fightLoss")` after fight

5. **Update Audit Types** (`economy/audit/types.ts`):

   ```typescript
   | "rpg_xp_gain"
   | "rpg_level_up"
   | "rpg_streak_update"
   ```

6. **Tests**:
   - Day rollover behavior
   - Streak increments and breaks
   - XP multiplier cap
   - Level-up detection

### Phase 12.5: Starter Questline

**Status**: Quest system exists, needs RPG integration

**Required Work**:

1. **Extend Quest Requirement Types** (`economy/quests/types.ts`):

   ```typescript
   | "rpg_equip"
   | "rpg_gather"
   | "rpg_process"
   | "rpg_upgrade"
   | "rpg_fight"
   ```

2. **Create Starter Questline** (`modules/rpg/quests/starter-questline.ts`):
   - Define 8-12 tutorial quests
   - Use new RPG requirement types
   - Configure XP/item rewards

3. **Create Quest Hooks** (`modules/rpg/quests/hooks.ts`):
   - `onEquip(userId, guildId, slot, itemId)`
   - `onGather(userId, guildId, actionType, amount)`
   - `onProcess(userId, guildId, recipeId)`
   - `onUpgradeTool(userId, guildId, toolId, toTier)`
   - `onFightComplete(userId, guildId, won)`

4. **Integrate Hooks**:
   - Call hooks from equipment/gathering/processing/upgrade/combat services
   - Hooks should call existing quest progression system

5. **Add Quest UI**:
   - `/rpg quests` command (or extend `/quests`)
   - Show current quest, progress bars, rewards

6. **Update Audit Types**:
   ```typescript
   | "rpg_quest_progress"
   | "rpg_quest_complete"
   ```

### Phase 12.6: Rare Drops + Cosmetics

**Status**: RNG utilities ready, needs drop logic

**Required Work**:

1. **Add Drop Config** (guild or global):

   ```typescript
   drops: {
     enabled: boolean;
     rates: {
       mine_tier2: { item: "gem_fragment", chance: 0.01 };
       process: { item: "perfect_ingot", chance: 0.05 };
     }
   }
   ```

2. **Create Drop Service** (`modules/rpg/drops/service.ts`):
   - `rollDrop(actionType, tier, rng)`: Check for drops
   - Use `makeActionRng()` for determinism

3. **Define Cosmetic Items**:
   - Extend item definitions with `cosmetic: true` flag
   - Add `cosmeticOf: baseItemId` reference
   - Ensure stats match base item

4. **Create Cosmetic Recipes** (if crafting module exists):
   - gem_fragment + materials → cosmetic skins

5. **Integrate Drop Rolls**:
   - gathering service: After successful gather, roll drop
   - processing service: After successful process, roll drop
   - If drop occurs, grant item via `rpgRewardService.grantItem()`

6. **Update Audit Types**:
   ```typescript
   | "rpg_rare_drop"
   | "rpg_cosmetic_craft"
   ```

### Phase 12.7: Weekly Events

**Status**: Event system exists, needs RPG modifiers

**Required Work**:

1. **Extend EventModifiers** (`economy/events/types.ts`):

   ```typescript
   {
     rpgXpMultiplier: number;
     rpgGatherYieldBonus: number;
     rpgDurabilityReduction: number;
     rpgCritBonus: number;
     rpgProcessingSuccessBonus: number;
   }
   ```

2. **Create Event Presets** (`modules/rpg/events/presets.ts`):

   ```typescript
   export const RPG_EVENT_PRESETS = {
     "Double Durability Weekend": { rpgDurabilityReduction: -0.5 },
     "Gold Rush": { rpgGatherYieldBonus: 1.0 },
     "Crit Festival": { rpgCritBonus: 0.2 },
   };
   ```

3. **Create Modifier Service** (`modules/rpg/events/modifier-service.ts`):
   - `getActiveModifiers(guildId)`: Read event config, return active modifiers
   - Auto-expire logic (if `now > endsAt`, clear event)

4. **Integrate Modifiers**:
   - Progression: Multiply XP by `rpgXpMultiplier`
   - Gathering: Add yield bonus, reduce durability loss
   - Processing: Adjust success rate
   - Combat: Add crit bonus to config

5. **Add Admin Commands**:
   - `/rpg event start <preset>`
   - `/rpg event stop`
   - `/rpg event view`

6. **Update Audit Types**:
   ```typescript
   | "rpg_event_start"
   | "rpg_event_stop"
   | "rpg_event_expire"
   ```

## Implementation Strategy

### Recommended Order

1. **Phase 12.4 First** (Progression + Streak):
   - Provides immediate feedback loop
   - Foundation for quest rewards
   - Hooks into existing actions

2. **Phase 12.5 Second** (Starter Questline):
   - Builds on progression XP rewards
   - Teaches the loop with direction
   - Can award items from drops

3. **Phase 12.6 Third** (Rare Drops + Cosmetics):
   - Adds excitement moments
   - Cosmetics can be quest rewards
   - No power creep concerns

4. **Phase 12.7 Last** (Weekly Events):
   - Multiplies the fun of existing systems
   - Requires all other systems working
   - Admin controls for guild rhythm

### Testing Approach

Each phase should have:

- Unit tests for calculations (XP curves, drop rates, modifiers)
- Integration tests for full flows (action → XP → level-up → quest progress)
- Determinism tests using seeded RNG

### Migration Path

1. Run schema migrations to add new fields to:
   - `rpg_profiles` collection (xp, level, activity)
   - `guild_config` collection (progression, streak, drops, events)

2. Backfill existing profiles with default values:
   - xp: 0, level: 1
   - activity: { dayKey: today, actionsToday: 0, streak: 0 }

3. Enable features gradually per guild via config flags

## Critical Dependencies

### Shared Primitives (COMPLETED ✅)

- UI utilities
- RNG utilities
- Reward service (stub)

### Data Schemas (TODO ⚠️)

- RPG Profile extensions
- Guild config extensions

### Service Integrations (TODO ⚠️)

- Hook progression into gathering/processing/upgrades/combat
- Hook quests into all RPG actions
- Hook drops into gathering/processing
- Hook events into all modified systems

## Build Checklist Before "Done"

- [ ] All TypeScript compiles (`tsc --noEmit`)
- [ ] All integration tests pass
- [ ] Audit operation types documented
- [ ] Guild config schema updated
- [ ] RPG profile schema updated
- [ ] Migration scripts created (if needed)
- [ ] Docs updated (command reference, config guide)
- [ ] No duplicated formatting/UI logic
- [ ] All rewards go through `rpgRewardService`
- [ ] All probability rolls use `makeActionRng()`
- [ ] Every new feature has at least one integration test

## Next Steps

The **highest priority** is to:

1. Extend the RPG profile schema with `xp`, `level`, and `activity` fields
2. Create the progression service with XP curve and streak logic
3. Hook `recordAction()` into existing RPG services
4. Add XP feedback to command responses

Once progression is working, the other phases build naturally on top of it.

## Notes

- The existing quest system is well-designed and just needs new requirement types
- The existing event system is perfect for RPG modifiers
- The combat engine's RNG pattern is the blueprint for all probability mechanics
- The UI design system provides all the colors/emojis needed

**The foundation is solid. The implementation is straightforward but requires careful integration across multiple services.**
