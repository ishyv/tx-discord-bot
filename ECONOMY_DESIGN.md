# DarkH Bot - Economy System Design Document

> **Purpose**: This document describes the conceptual architecture and logic of the DarkH Discord bot's economy system. It is intended for re-implementing these features in other codebases, focusing on ideas and concepts rather than specific implementation details.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [User Account System](#user-account-system)
3. [Currency System](#currency-system)
4. [Inventory System](#inventory-system)
5. [Item/Object System](#itemobject-system)
6. [Experience & Leveling](#experience--leveling)
7. [Work System](#work-system)
8. [Daily Rewards](#daily-rewards)
9. [Trading & Transactions](#trading--transactions)
10. [Gambling Features](#gambling-features)
11. [Guild Economy](#guild-economy)
12. [Perks System](#perks-system)
13. [Social Features](#social-features)
14. [Moderation & Safety](#moderation--safety)
15. [RPG Equipment System](#rpg-equipment-system)

---

## Core Concepts

### Account Lifecycle
- **Auto-creation**: Accounts are created automatically when users interact with economy commands
- **Lazy initialization**: No manual registration required; accounts spawn on first economic activity
- **Account status tracking**: Accounts can be in states: `ok`, `blocked`, or `banned`

### Data Persistence
- User data stored in structured JSON format
- Guild-specific settings and economy tracked separately
- Periodic data integrity checks and migrations

---

## User Account System

### Account Structure
Each user account contains:

| Field | Description |
|-------|-------------|
| `money` | Cash on hand (liquid currency) |
| `bank_money` | Stored/safe currency |
| `inventory` | Dictionary of owned items with quantities |
| `perks` | Passive bonuses and capacity upgrades |
| `profile` | Social stats, XP, level, voting records |
| `status` | Account standing (ok/blocked/banned) |
| `warnings` | Report history from other users |

### Profile Attributes
- **XP & Level**: Progression system with tiered rewards
- **Social Voting**: "Loved" (upvotes) and "Hated" (downvotes) counters
- **Daily Streak**: Consecutive daily reward claims
- **Pact System**: Moral alignment choice (Blessing vs Curse)

---

## Currency System

### Dual Currency Model

#### 1. Cash (Liquid Money)
- Used for immediate transactions
- Subject to theft/robbery
- Required for gambling and trading
- Losable upon penalties

#### 2. Bank Money (Protected Storage)
- Safe from theft mechanisms
- Withdrawal/deposit taxes apply
- Minimum thresholds for transactions

### Tax System
- **Global tax rate**: Configurable percentage (default: 5%)
- **Transaction types taxed**:
  - Money transfers between users
  - Bank deposits/withdrawals
  - Gambling winnings
  - Item sales
- **Tax destination**: Guild economy treasury

### Money Management Operations
- `add`: Increase balance
- `less`: Decrease balance  
- `set`: Direct assignment
- `mult`: Multiplication (for events/bonuses)
- `div`: Division (for penalties)

---

## Inventory System

### Capacity Constraints

#### Dual Limit System
1. **Weight-based**: Each item has weight; total cannot exceed perk-based limit
2. **Slot-based**: Maximum number of distinct item types

#### Default Limits
- Starting weight capacity: 200 units
- Starting slot capacity: 20 items

### Inventory Operations
- **Add**: Check capacity constraints before adding
- **Remove**: Delete items from inventory
- **Auto-cleanup**: Remove zero-quantity items automatically

### Overload Mechanics
When limits exceeded:
1. Warning issued to user
- 1-hour grace period to resolve
- Auto-purge if unresolved:
  - **Weight overload**: Remove heaviest items first
  - **Capacity overload**: Remove least valuable items first

### Item Stacking
- **Stackable items**: Multiple units occupy single slot (food, materials)
- **Non-stackable items**: Each unit occupies separate slot (tools, weapons)
- **Durability system**: Non-stackable items have usage counters instead of quantities

---

## Item/Object System

### Item Attributes

| Attribute | Purpose |
|-----------|---------|
| `name` | Display name |
| `description` | Flavor text |
| `img` | Emoji/icon representation |
| `value` | Base monetary value |
| `weight` | Inventory weight contribution |
| `type` | Category (food, tool, weapon, armor, material) |
| `can_stack` | Whether multiples occupy one slot |
| `can_sell` | Whether sellable to system |
| `can_drop` | Whether discardable |
| `can_equip` | Whether usable in RPG system |
| `can_upgrade` | Whether tier progression possible |
| `amount` | Quantity or durability |

### Item Categories

#### 1. Consumables (Food/Drink)
- Single-use items
- No practical effect (flavor/cosmetic)
- Stackable

#### 2. Tools
- Used for resource gathering
- Have durability (non-stackable)
- Tiered levels (Lv1-Lv4)
- Higher tiers = better rewards

#### 3. Materials
- Raw resources from gathering
- Stackable
- Used for crafting/upgrading

#### 4. Equipment (RPG)
- Weapons: Increase attack stat
- Armor (helmet/chest/pants/boots): Increase defense
- Accessories: Various bonuses

### Crafting System
- **Input**: 2 units of raw material → 1 unit of processed material
- **Cost**: Monetary fee (percentage of output value)
- **Failure chance**: Probability-based; failure consumes materials
- **Luck influence**: Player's luck perk improves success chance

### Item Upgrades
- **Prerequisites**: Money + specific materials
- **Progression**: Linear tier advancement (Lv1 → Lv2 → Lv3 → Lv4)
- **Benefits**: Higher durability, better gathering yields

---

## Experience & Leveling

### XP Gain Mechanics
- **Random chance**: Not guaranteed on every action
- **Luck bonus**: Perk increases success chance
- **Range**: Random XP amount within range (e.g., 1-5)

### Level Tiers (0-12+)
| Level | XP Required | Badge |
|-------|-------------|-------|
| 0 | 0 | 🔹 |
| 1 | 100 | ♙ |
| 2 | 220 | ♞ |
| 3 | 360 | ♗ |
| 4 | 520 | ♜ |
| 5 | 700 | ♔ |
| 6 | 900 | ♛ |
| 7 | 1140 | 🂠 |
| 8 | 1400 | 🃏 |
| 9 | 1720 | 🀄️ |
| 10 | 2060 | 🎴 |
| 11 | 2420 | 🌀 |
| 12 | 2800 | 🌌 |

### Level-Up Rewards
Each level grants:
- **Money bonus**: Scaling lump sum (10,500 × level at Lv1, increasing)
- **Perk increases**: Weight capacity, inventory slots, luck
- **Escalating bonuses**: Higher levels give larger perk boosts

---

## Work System

### Activity-Based Earning
- **Randomized mini-games**: Quick-response emoji matching
- **Reward range**: Random amount within band (e.g., 500-1250)
- **Cooldown**: Time-based (randomized between 5-10 minutes)
- **Guild dependency**: Rewards limited by guild work treasury

### Work Activity Types
Activities present users with scenarios requiring emoji responses:
- Sports (baseball, basketball)
- Labor (woodcutting, mining)
- Professional (science, office work, cleaning)
- Discovery (finding money, minerals)

### Success/Failure
- Correct response: Full reward
- Wrong/timeout: No reward

---

## Daily Rewards

### Streak System
- **Consecutive days**: Rewards scale with streak length
- **Progressive scaling**: Day 1 = 500, Day 30 = 15,000
- **Post-30 cap**: Fixed maximum (e.g., 17,777)
- **Reset mechanism**: 24-hour+ gap resets streak to 0

### Reward Tiers
```
Days 1-10:  +500 per day (500, 1000, 1500...)
Days 11-20: +500 per day (5500, 6000...)
Days 21-30: +500 per day (10500, 11000...)
Day 31+: Fixed bonus
```

---

## Trading & Transactions

### Direct Transfer (Give)
- **Minimum amount**: Floor to prevent spam
- **Tax applied**: Percentage taken from transfer
- **Large transfer alerts**: Notifications for suspicious amounts
  - 100K+: "High amount" warning
  - 1M+: "Very high amount" investigation notice
  - 5M+: "Huge amount" escalation
  - 10M+: "Extremely large amount" alert

### Request System
- **Asynchronous**: Target user responds via DM
- **Approval flow**: Target specifies amount to give
- **Tax splitting**: Deducted from final transfer

### Store/Buy System
- **Catalog**: Paginated item listings
- **Stock check**: Verify item exists and is purchasable
- **Capacity pre-check**: Simulate add before purchase
- **Guild economy**: Purchase fees contribute to guild trade pool

### Sell System
- **Depreciated value**: Items sell for ~85% of value
- **Tax on sale**: Additional percentage to guild treasury
- **Guild liquidity**: Sales require guild trade pool solvency

---

## Gambling Features

### Coin Flip (50/50)
- **Choices**: Heads/Tails (or localized equivalents)
- **Win**: 95% return (5% tax)
- **Loss**: Full bet lost to guild economy
- **Guild solvency check**: Cannot bet more than guild can pay

### Steal/Rob System
- **Target requirements**: Victim must have minimum cash threshold
- **Success chance**: Base probability + luck perk bonus
- **Success reward**: Random percentage of victim's cash (35% max)
- **Failure penalty**: Fine paid to guild treasury
- **Victim notification**: DM alert when robbed

### Trivia
- **Multiple choice**: 4 answer options
- **Reward tiers**: Randomized amounts (500, 750, 1000)
- **Single attempt**: No retries

---

## Guild Economy

### Economic Sectors
Guild economy tracks four revenue streams:

| Sector | Source |
|--------|--------|
| `global` | Base funding, events |
| `works` | Work command rewards |
| `trade` | Store purchases, gambling, transfers |
| `tax` | All taxation (temporary pool) |

### Economic Cycle
- **Periodic redistribution**: Taxes redistributed periodically
- **Allocation percentages**:
  - 50% → Trade pool
  - 40% → Works pool
  - 10% → Global pool
- **Decay mechanisms**: Some pools diminish over time

### Economic Health Indicators
- Color-coded status based on global pool:
  - 🟢 Green: 10M+ (Prosperous)
  - 🔵 Blue: 1M+ (Healthy)
  - 🟡 Gold: 500K+ (Stable)
  - 🟠 Orange: 100K+ (Struggling)
  - 🔴 Red: <100K (Critical)

---

## Perks System

### Core Perks

| Perk | Effect | Default |
|------|--------|---------|
| `peso` (weight) | Max inventory weight | 200 |
| `capacidad` (capacity) | Max item slots | 20 |
| `suerte` (luck) | Success chance bonus | 0 |

### Perk Upgrade System
- **Random selection**: One perk offered randomly
- **Cost scaling**: Higher values = higher costs
  - Low: 10,000 + wood
  - Mid: 20,000 + iron
  - High: 30,000 + palm wood
  - Very High: 40,000 + gold ore
- **Value ranges**: Random increase within tiered bands

---

## Social Features

### Voting System
- **Upvotes (Love)**: Positive reputation
- **Downvotes (Hate)**: Negative reputation
- **One vote per user**: Can change vote but not duplicate
- **Cooldown**: Time-limited voting frequency

### Report System
- **Warning accumulation**: 5 warnings = auto-block
- **Block consequences**: Account restrictions applied
- **Appeal mechanism**: Manual review request
- **Ban escalation**: Permanent account termination possible

### Pact System
- **Moral alignment**: Binary choice (Blessing vs Curse)
- **Cosmetic indicator**: Badge on profile
- **Permanent choice**: Cannot be changed after selection

---

## Moderation & Safety

### Account States

| Status | Effects |
|--------|---------|
| `ok` | Full functionality |
| `blocked` | Cannot use economy commands; can appeal |
| `banned` | Permanent termination; data wiped |

### Automated Penalties
- **Inventory overload**: Auto-purge after grace period
- **Report threshold**: Auto-block at warning limit
- **Suspicious transfers**: Monitoring alerts

### Administrative Tools
- **Direct money manipulation**: Add/remove/set
- **Inventory management**: Give/remove items
- **Account termination**: Full wipe and ban
- **Mass operations**: Server-wide economic adjustments

---

## RPG Equipment System

### Equipment Slots
- Weapon (attack bonus)
- Shield (defense bonus)
- Helmet (defense bonus)
- Chest armor (defense bonus)
- Pants (defense bonus)
- Boots (defense bonus)
- Ring (various properties)
- Necklace (various properties)

### Equipment Flow
1. **Acquire**: Obtain items through purchase/crafting
2. **Equip**: Move from inventory to equipment slot
3. **Stats calculation**: Sum equipment properties
4. **Unequip**: Return to inventory (if space available)

### Item Properties
Objects define RPG stats:
- `atk`: Attack damage
- `def`: Damage reduction
- `hp`: Health points
- Custom properties for accessories

---

## Design Principles Summary

1. **Progressive Complexity**: Simple start with depth through unlocks
2. **Risk/Reward Balance**: Higher rewards carry higher risks
3. **Social Integration**: Economy tied to social interactions
4. **Guild Dependency**: Individual success linked to guild health
5. **Choice Permanence**: Meaningful decisions with lasting impact
6. **Anti-Cheat**: Transaction monitoring and penalty systems
7. **Engagement Loops**: Daily rewards, streaks, random events

---

## Implementation Notes for Re-implementation

- Use **decimal/float** for currency to support fractional values
- Implement **transaction atomicity** to prevent duplication exploits
- **Validate all constraints** (weight, capacity, solvency) before committing
- **Async safety**: Economy operations must be thread-safe
- **Audit logging**: Track significant transactions for moderation
- **Graceful degradation**: Handle missing accounts/data corruption
