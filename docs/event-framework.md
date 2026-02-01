# Event Framework (Phase 9e)

Guild-scoped events with configurable modifiers for XP, rewards, and discounts.

## Overview

The event framework allows server administrators to run special events with boosted rewards and discounts. Events can have:

- **Duration**: Set time period or indefinite
- **Modifiers**: XP multiplier, reward bonuses, store discounts
- **Event Currency** (optional): Special currency earned during events
- **Event Quests**: Special quests only available during events

## Configuration

### Event Modifiers

| Modifier | Description | Default | Range |
|----------|-------------|---------|-------|
| `xpMultiplier` | XP gain multiplier | 1.0 | 0.1 - 5.0 |
| `dailyRewardBonusPct` | Daily reward bonus | 0% | 0% - 200% |
| `workRewardBonusPct` | Work reward bonus | 0% | 0% - 200% |
| `triviaRewardBonusPct` | Trivia reward bonus | 0% | 0% - 200% |
| `storeDiscountPct` | Store discount | 0% | 0% - 50% |
| `questRewardBonusPct` | Quest reward bonus | 0% | 0% - 200% |
| `craftingCostReductionPct` | Crafting cost reduction | 0% | 0% - 50% |

### Commands

**User Commands:**
```bash
/event                    # View current event status
```

**Admin Commands:**
```bash
# Start an event
/event-start 
  name:"Double XP Weekend"
  description:"Earn 2x XP on all activities!"
  duration:48
  xp_multiplier:2.0
  store_discount:0.1

# Stop an event early
/event-stop
```

## Event Quests

Special quests that appear during events:

| Quest | Difficulty | Requirements | Rewards |
|-------|------------|--------------|---------|
| 🎉 Event Enthusiast | Easy | Claim daily 3x | 500 coins, 100 XP |
| 💰 Event Spender | Medium | Spend 1,000 coins | 300 coins, 150 XP |
| 🎯 Trivia Champion | Medium | Win 5 trivia games | 750 coins, 200 XP |
| 🔨 Master Crafter | Medium | Craft 3 items | 600 coins, 180 XP |
| ❤️ Community Supporter | Easy | Cast 3 love votes | 400 coins, 120 XP |
| ⚡ Power Worker | Hard | Work 5 times | 1,000 coins, 250 XP |
| 🎰 Lucky Gambler | Hard | Win 10 coinflip games | 800 coins, 220 XP, 5 tokens |
| 🏆 Event Legend | Legendary | Complete all other event quests | 5,000 coins, 1,000 XP, 25 tokens |

## Integration

Event modifiers are automatically applied to:

- **XP Gains**: Via `eventService.applyXPMultiplier()`
- **Daily Rewards**: Via `eventService.applyDailyBonus()`
- **Work Rewards**: Via `eventService.applyWorkBonus()`
- **Trivia Rewards**: Via `eventService.applyTriviaBonus()`
- **Store Prices**: Via `eventService.applyStoreDiscount()`
- **Quest Rewards**: Via `eventService.applyQuestBonus()`
- **Crafting Costs**: Via `eventService.applyCraftingReduction()`

## Audit Logging

Event actions are logged with `operationType: "config_update"`:

```typescript
{
  correlationId: string;
  eventName: string;
  startsAt: Date;
  endsAt?: Date;
  modifiers: EventModifiers;
}
```

## Examples

### Double XP Weekend
```bash
/event-start name:"Double XP Weekend" duration:48 xp_multiplier:2.0
```

### Black Friday Sale
```bash
/event-start name:"Black Friday" duration:24 store_discount:0.30
```

### Festival of Giving
```bash
/event-start name:"Festival of Giving" duration:72 \
  daily_bonus:0.5 work_bonus:0.5 quest_bonus:0.5
```

## Files

- `src/modules/economy/events/types.ts` - Types and calculations
- `src/modules/economy/events/repository.ts` - Database persistence
- `src/modules/economy/events/service.ts` - Business logic
- `src/commands/economy/event.ts` - UI commands
- `src/modules/economy/quests/event-quests.ts` - Event quest templates
- `tests/unit-tests/event-modifiers.unit.test.ts` - Tests
