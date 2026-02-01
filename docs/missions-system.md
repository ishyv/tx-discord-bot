# Quest System (Quest Board 2.0)

Technical documentation of the daily/weekly quest system with an interactive Board.

## Index

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quest Types](#quest-types)
4. [Requirements](#requirements)
5. [Rewards](#rewards)
6. [Rotations](#rotations)
7. [Service API](#service-api)
8. [Integration with other Systems](#integration-with-other-systems)
9. [UI/UX](#uiux)
10. [Auditing and Rollback](#auditing-and-rollback)

---

## Overview

The Quest System provides:

- **Daily Quests**: 3 quests that renew every day
- **Weekly Quests**: 5 quests that renew every week
- **Featured Quest**: 1 quest with increased rewards
- **Persistent Progress**: Tracking of progress per user
- **Automatic Rewards**: Distribution of coins, XP, items, and tokens

### Available Commands

| Command             | Description                       |
| ------------------- | --------------------------------- |
| `/quests [tab]`     | Opens the interactive Quest Board |
| `/quest view <id>`  | View details of a specific quest  |
| `/quest claim <id>` | Claim rewards for a quest         |
| `/quest progress`   | View general user progress        |
| `/quest list`       | List all available quests         |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  /quests    │  │   /quest    │  │  UI Components      │  │
│  │  (board)    │  │  (manage)   │  │  (buttons/menus)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ QuestService │  │QuestRotation │  │   Quest Hooks    │  │
│  │              │  │   Service    │  │  (integration)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     REPOSITORY LAYER                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Templates  │  │  Rotations  │  │     Progress        │  │
│  │  (MongoDB)  │  │  (MongoDB)  │  │    (MongoDB)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/modules/economy/quests/
├── types.ts        # Types, interfaces, and constants
├── repository.ts   # Data access (repository pattern)
├── service.ts      # Business logic
├── rotation.ts     # Rotation generation
├── hooks.ts        # Integration with other systems
├── ui.ts           # Embed/component builders
└── index.ts        # Public exports
```

---

## Quest Types

### Difficulty

| Difficulty  | Emoji | Description | Base Multiplier |
| ----------- | ----- | ----------- | --------------- |
| `easy`      | 🟢    | Easy        | 1.0x            |
| `medium`    | 🔵    | Medium      | 1.0x            |
| `hard`      | 🟠    | Hard        | 1.0x            |
| `expert`    | 🔴    | Expert      | 1.0x            |
| `legendary` | 🟣    | Legendary   | 1.0x            |

### Categories

| Category      | Emoji | Description        |
| ------------- | ----- | ------------------ |
| `general`     | 📋    | General quests     |
| `economy`     | 💰    | Economy related    |
| `social`      | 👥    | Social interaction |
| `minigame`    | 🎮    | Minigames          |
| `crafting`    | 🔨    | Item crafting      |
| `voting`      | 🗳️    | Voting system      |
| `exploration` | 🗺️    | Exploration        |

---

## Requirements

### Supported Requirement Types

#### 1. `do_command` - Use Command

```typescript
{
  type: "do_command",
  command: "work",    // Command name
  count: 5            // Times it must be used
}
```

#### 2. `spend_currency` - Spend Currency

```typescript
{
  type: "spend_currency",
  currencyId: "coins", // Currency ID
  amount: 1000         // Amount to spend
}
```

#### 3. `craft_recipe` - Craft Recipe

```typescript
{
  type: "craft_recipe",
  recipeId: "wood_planks", // Recipe ID
  count: 10                // Times to craft
}
```

#### 4. `win_minigame` - Win Minigame

```typescript
{
  type: "win_minigame",
  game: "coinflip" | "trivia", // Minigame type
  count: 5                      // Required wins
}
```

#### 5. `vote_cast` - Cast Vote

```typescript
{
  type: "vote_cast",
  voteType: "love" | "hate", // Vote type
  count: 10                   // Votes to cast
}
```

---

## Rewards

### Reward Types

#### 1. Currency (`currency`)

```typescript
{
  type: "currency",
  currencyId: "coins",
  amount: 500,
  source: "mint" | "guild_sector",  // Funding source
  sector?: "works" | "trade" | "tax" // Sector (if applicable)
}
```

#### 2. Experience (`xp`)

```typescript
{
  type: "xp",
  amount: 100  // XP to grant
}
```

#### 3. Item (`item`)

```typescript
{
  type: "item",
  itemId: "rare_material",
  quantity: 3
}
```

#### 4. Quest Tokens (`quest_token`)

```typescript
{
  type: "quest_token",
  amount: 5  // Tokens for future shop
}
```

### Featured Multiplier

When a quest is selected as "featured", its rewards are multiplied:

```typescript
const finalAmount = baseAmount * featuredMultiplier;
```

| Quest Type         | Multiplier |
| ------------------ | ---------- |
| Normal             | 1.0x       |
| Easy featured      | 1.5x       |
| Hard featured      | 2.0x       |
| Expert featured    | 2.5x       |
| Legendary featured | 3.0x       |

---

## Rotations

### Configuration

```typescript
interface QuestRotationConfig {
  dailyQuestCount: number; // Default: 3
  weeklyQuestCount: number; // Default: 5
  featuredEnabled: boolean; // Default: true
  dailyResetHour: number; // Default: 0 (UTC)
  weeklyResetDay: number; // Default: 1 (Monday)
  weeklyResetHour: number; // Default: 0 (UTC)
}
```

### Quest Selection

The system selects quests for rotations based on:

1. **Difficulty Distribution**: Weighted weight by difficulty
   - Easy: 3x weight
   - Medium: 2x weight
   - Hard: 1x weight
   - Expert: 0.5x weight
   - Legendary: 0.25x weight

2. **Featured Quest**: Selected from quests with `canBeFeatured: true`

### Lifecycle

```
Rotation Created → Active → Expired → Deleted
      ↑                                 |
      └────────── New Rotation ←────────┘
```

---

## Service API

### QuestService

#### Create Template

```typescript
const result = await questService.createTemplate(
  guildId,
  {
    id: "unique_quest_id",
    name: "Quest Name",
    description: "Description",
    category: "economy",
    difficulty: "medium",
    requirements: [...],
    rewards: [...],
    maxCompletions: 1,
    canBeFeatured: true,
    featuredMultiplier: 1.5,
  },
  createdByUserId
);
```

#### Get Quest Board

```typescript
const board = await questService.getQuestBoard(guildId, userId);
// Returns: QuestBoardView
```

#### Claim Rewards

```typescript
const result = await questService.claimRewards({
  guildId,
  userId,
  rotationId,
  questId,
});
```

### Quest Rotation Service

#### Generate Rotations

```typescript
// Generate manually
const daily = await questRotationService.generateDailyRotation(guildId);
const weekly = await questRotationService.generateWeeklyRotation(guildId);

// Ensure they exist
const status = await questRotationService.ensureCurrentRotations(guildId);
```

### Quest Hooks (Integration)

Hooks allow other systems to automatically record progress:

```typescript
import {
  trackCommandUsage,
  trackCurrencySpent,
  trackCrafting,
  trackMinigameWin,
  trackVoteCast,
} from "@/modules/economy/quests";

// In the Work service:
await trackCommandUsage(userId, guildId, "work");

// In the Crafting service:
await trackCrafting(userId, guildId, recipeId, quantity);

// In the Minigames service:
await trackMinigameWin(userId, guildId, "coinflip");

// In the Voting service:
await trackVoteCast(userId, guildId, "love");
```

---

## Integration with other Systems

### Work System

```typescript
// In work/service.ts after processing work
import { trackCommandUsage } from "../quests/hooks";

await trackCommandUsage(userId, guildId, "work");
```

### Crafting System

```typescript
// In crafting/service.ts after successful crafting
import { trackCrafting } from "../quests/hooks";

await trackCrafting(userId, guildId, recipeId, quantity);
```

### Minigames

```typescript
// In minigames/service.ts when the user wins
import { trackMinigameWin } from "../quests/hooks";

await trackMinigameWin(userId, guildId, gameType);
```

### Voting System

```typescript
// In voting/service.ts when a vote is cast (voter only)
import { trackVoteCast } from "../quests/hooks";

await trackVoteCast(voterId, guildId, voteType);
```

---

## UI/UX

### Quest Board

The interactive Board (`/quests`) includes:

1. **Selection Menu**: Switch between Daily/Weekly/Featured
2. **Quest Buttons**: View details of each quest
3. **Progress Indicators**:
   - 🆕 New
   - 🔄 X% In progress
   - 🎁 Ready to claim
   - ✅ Completed

### Colors by Difficulty

| Difficulty | Color      |
| ---------- | ---------- |
| Easy       | 🟢 #2ecc71 |
| Medium     | 🔵 #3498db |
| Hard       | 🟠 #e67e22 |
| Expert     | 🔴 #e74c3c |
| Legendary  | 🟣 #9b59b6 |

---

## Auditing and Rollback

### Auditing

All quest completion operations are audited:

```typescript
await economyAuditRepo.create({
  operationType: "quest_complete",
  actorId: userId,
  targetId: userId,
  guildId,
  source: "quest",
  metadata: {
    correlationId,
    questId,
    rotationId,
    rewards: [...],
    requirementProgress: [...],
  },
});
```

### Rollback

Rewards can be reverted using the existing rollback system:

```typescript
import { rollbackByCorrelationId } from "@/modules/economy/rollback";

const result = await rollbackByCorrelationId({
  correlationId: "quest_123456789",
  guildId,
  actorId: adminId,
});
```

The rollback:

1. Searches all audit entries with the `correlationId`
2. Reverts currency changes
3. Reverts inventory changes
4. Reverts sector changes
5. Creates rollback audit entry

---

## Example Quest Template

```typescript
const exampleQuest = {
  id: "economic_magnate",
  name: "Economic Magnate",
  description: "Spend a large amount of coins on the server",
  category: "economy",
  difficulty: "hard",
  requirements: [{ type: "spend_currency", currencyId: "coins", amount: 5000 }],
  rewards: [
    { type: "currency", currencyId: "coins", amount: 1000 },
    { type: "quest_token", amount: 5 },
    { type: "xp", amount: 250 },
  ],
  cooldownHours: 168, // 1 week
  maxCompletions: 1,
  canBeFeatured: true,
  featuredMultiplier: 2.0,
  enabled: true,
};
```

---

## Tests

Integration tests are in:

```
tests/db-tests/quests/
├── quest.test.ts      # General tests
└── rewards.test.ts    # Rewards and rollback tests
```

To run:

```bash
bun test tests/db-tests/quests
```

---

## Implementation Notes

1. **Atomicity**: Reward claim operations are atomic - all rewards are granted or none.

2. **Idempotency**: Progress tracking is idempotent - multiple calls with the same parameters do not duplicate progress.

3. **Concurrency**: The system uses compare-and-swap for concurrent progress updates.

4. **Expiration**: Old rotations should be cleaned periodically (TTL or scheduled job).

5. **Opt-out**: The voting system respects user opt-out preferences.
