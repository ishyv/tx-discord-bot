# PyEBot - Economy System Design Document

> **Purpose**: This document describes the conceptual architecture and logic of the PyEBot Discord bot's economy system. Updated to reflect the current implementation including the Trinkets system, rarity tiers, and exponential leveling curve.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [User Account System](#user-account-system)
3. [Currency System](#currency-system)
4. [Inventory System](#inventory-system)
5. [Item/Object System](#itemobject-system)
6. [Trinkets System](#trinkets-system)
7. [Experience & Leveling](#experience--leveling)
8. [Work System](#work-system)
9. [Daily Rewards](#daily-rewards)
10. [Trading & Transactions](#trading--transactions)
11. [Gambling Features](#gambling-features)
12. [Guild Economy](#guild-economy)
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
- User data stored in MongoDB with atomic transaction support
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
| `equipment` | Equipped trinkets by guild |
| `profile` | Social stats, XP, level, voting records |
| `status` | Account standing (ok/blocked/banned) |

### Profile Attributes
- **XP & Level**: Progression system with exponential difficulty curve (Levels 1-10)
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
- **Non-stackable items**: Each unit occupies separate slot (tools, weapons, trinkets)
- **Durability system**: Non-stackable items have usage counters instead of quantities

---

## Item/Object System

### Item Attributes

| Attribute | Purpose |
|-----------|---------|
| `name` | Display name |
| `description` | Flavor text |
| `emoji` | Emoji/icon representation |
| `value` | Base monetary value |
| `weight` | Inventory weight contribution |
| `type` | Category (food, tool, weapon, armor, material, trinket) |
| `can_stack` | Whether multiples occupy one slot |
| `rarity` | Item tier (Common, Uncommon, Rare, Holy, Unique) |
| `required_level` | Minimum level to equip/use |

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

#### 4. Trinkets (Economy Equipment)
- Provide economic bonuses (not combat stats)
- 6 base slots: Primary Trinket, Secondary Trinket, Left Ring, Right Ring, Necklace, Belt
- Bonus slots available through special items
- Non-stackable

#### 5. RPG Equipment
- Separate from trinkets
- Weapons: Increase attack stat
- Armor (helmet/chest/pants/boots): Increase defense
- Accessories: Various combat bonuses

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

## Trinkets System

### Overview
The Trinkets system replaces the old economy equipment to avoid confusion with RPG combat gear. Trinkets are magical items (charms, rings, necklaces, belts) that provide economic bonuses called "boons."

### Rarity Tiers

| Rarity | Emoji | Color | Level Range | Description |
|--------|-------|-------|-------------|-------------|
| Common | 🟢 | Green | 1-3 | Basic items for beginners |
| Uncommon | 🔵 | Blue | 4-5 | Improved items with better stats |
| Rare | 🟣 | Purple | 6-7 | Powerful items for dedicated players |
| Holy | 🟡 | Gold | 8-10 | Legendary items for masters |
| Unique | 🔴 | Red | Special | One-of-a-kind quest-gated items |

### Base Slots (6 slots)

| Slot | Type | Example Items |
|------|------|---------------|
| 🔮 Trinket (Primary) | Main magical item | Lucky Charm, Merchant's Seal, Golden Compass |
| ✨ Trinket (Secondary) | Supporting item | Crystal Orb, Chronos Timepiece |
| 💍 Ring (Left) | First magical ring | Novice's Band, Silver Ring of Commerce, Golden Ring of Wealth |
| 💍 Ring (Right) | Second magical ring | Band of the Steady Hand, Whispering Band, Platinum Band of Mastery |
| 📿 Necklace | Amulet/Pendant | Cord of Burden, Lucky Amulet, Merchant's Pendant, Crown Jewel |
| 🎗️ Belt | Storage/Utility | Sash of the Wanderer, Bottomless Pouch, Artisan's Sash, Dimemorphin Belt |

### Bonus Slots
- Additional slots beyond the base 6
- Granted by specific trinkets with `slotCap` stat
- Slot-expanding items cannot be equipped in bonus slots (except Dimemorphin Belt)

### Slot Expansion Items

| Item | Rarity | Slot Expansion | Notes |
|------|--------|----------------|-------|
| Bottomless Pouch | Common | +1 slot | Moved to Belt slot |
| Crystal Orb | Uncommon | +1 slot | Cannot equip in bonus slots |
| Chronos Timepiece | Rare | +2 slots | Cannot equip in bonus slots |
| Dimemorphin Belt | Holy | Infinite | Can equip in bonus slots; extremely rare |

### Boon Types (Stats)

| Boon | Effect |
|------|--------|
| 🍀 Luck | Better chances in gambling |
| 🛠️ Work Bonus | More earnings from /work |
| 🏷️ Shop Discount | Lower prices in store |
| 📅 Streak Bonus | Higher daily reward caps |
| ⚖️ Weight Capacity | Carry more items |
| 📦 Slot Capacity | More trinket slots |

### Example Trinkets by Rarity

**Common (🟢 Level 1-3):**
- Lucky Charm: +2 Luck, +2% Work bonus
- Novice's Band: +1 Luck
- Band of the Steady Hand: +3% Work bonus
- Cord of Burden: +5 Weight capacity
- Sash of the Wanderer: +15 Weight capacity

**Uncommon (🔵 Level 4-5):**
- Crystal Orb: +4% Work, +1 Luck, +1 Slot
- Lucky Amulet: +3 Luck, +1 Streak
- Silver Ring of Commerce: +4% Discount, +1 Luck
- Whispering Band: +2 Luck, +10 Weight
- Artisan's Sash: +20 Weight, +4% Work

**Rare (🟣 Level 6-7):**
- Golden Compass: +3 Luck, +1 Streak, +4% Work
- Chronos Timepiece: +6% Work, +2 Streak, +2 Slots
- Golden Ring of Wealth: +6% Discount, +3% Work, +2 Luck
- Platinum Band of Mastery: +5% Work, +4% Discount, +1 Streak
- Merchant's Pendant: +5% Discount, +2% Work, +1 Luck

**Holy (🟡 Level 8-10):**
- Crown Jewel: +4 Luck, +8% Discount, +5% Work, +2 Streak
- Dimemorphin Belt: Infinite slot expansion

---

## Experience & Leveling

### XP Gain Mechanics
- **Random chance**: Not guaranteed on every action
- **Luck bonus**: Perk increases success chance
- **Range**: Random XP amount within range (e.g., 1-5)

### Level Tiers (1-10) - Exponential Curve

| Level | Total XP Required | XP to Next | Difficulty | Rarity Tier |
|-------|-------------------|------------|------------|-------------|
| 1 | 0 | 100 | Easy | Common |
| 2 | 100 | 200 | Easy | Common |
| 3 | 300 | 400 | Easy | Common |
| 4 | 700 | 800 | Moderate | Uncommon |
| 5 | 1,500 | 2,000 | Moderate | Uncommon |
| 6 | 3,500 | 3,500 | Hard | Rare |
| 7 | 7,000 | 6,000 | Hard | Rare |
| 8 | 13,000 | 10,000 | Very Hard | Holy |
| 9 | 23,000 | 15,000 | Very Hard | Holy |
| 10 | 38,000 | Max | Extreme | Holy |

### Key Difficulty Walls
- **Level 5→6**: First major wall (2,000 XP)
- **Level 7→8**: Second major wall (6,000 XP)
- **Level 9→10**: Final push (15,000 XP)

### Level-Up Rewards
Each level grants:
- **Money bonus**: Scaling lump sum
- **Perk increases**: Weight capacity, inventory slots, luck
- **Equipment unlocks**: Access to higher rarity trinkets

---

## Work System

### Activity-Based Earning
- **Randomized mini-games**: Quick-response emoji matching
- **Reward range**: Random amount within band (e.g., 500-1250)
- **Cooldown**: Time-based (randomized between 5-10 minutes)
- **Guild dependency**: Rewards limited by guild work treasury
- **Trinket bonuses**: Work bonus percentage from equipped trinkets

### Work Activity Types
Activities present users with scenarios requiring emoji responses:
- Sports (baseball, basketball)
- Labor (woodcutting, mining)
- Professional (science, office work, cleaning)
- Discovery (finding money, minerals)

### Success/Failure
- Correct response: Full reward + trinket bonuses
- Wrong/timeout: No reward

---

## Daily Rewards

### Streak System
- **Consecutive days**: Rewards scale with streak length
- **Progressive scaling**: Day 1 = 500, Day 30 = 15,000
- **Post-30 cap**: Fixed maximum (e.g., 17,777)
- **Reset mechanism**: 24-hour+ gap resets streak to 0
- **Trinket bonuses**: Streak bonus cap from equipped trinkets

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
- **Trinket discounts**: Shop discount percentage from equipped trinkets

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
- **Luck bonus**: Trinket luck stat improves success chance

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

### Equipment Slots (Combat Gear)
- Weapon (attack bonus)
- Shield (defense bonus)
- Helmet (defense bonus)
- Chest armor (defense bonus)
- Pants (defense bonus)
- Boots (defense bonus)
- Ring (various combat properties)
- Necklace (various combat properties)
- Tool (gathering equipment)

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

### Key Distinction
- **Trinkets** (`/trinkets`): Economy bonuses (work, luck, discounts)
- **RPG Equipment** (`/rpg equip`): Combat stats (attack, defense, HP)

---

## Design Principles Summary

1. **Progressive Complexity**: Simple start with depth through unlocks
2. **Risk/Reward Balance**: Higher rewards carry higher risks
3. **Social Integration**: Economy tied to social interactions
4. **Guild Dependency**: Individual success linked to guild health
5. **Choice Permanence**: Meaningful decisions with lasting impact
6. **Anti-Cheat**: Transaction monitoring and penalty systems
7. **Engagement Loops**: Daily rewards, streaks, random events
8. **Clear Separation**: Distinct systems for economy (trinkets) and combat (RPG gear)
9. **Visual Clarity**: Rarity system with color-coded tiers
10. **Long-term Goals**: Exponential leveling for extended engagement

---

## Implementation Notes for Re-implementation

- Use **decimal/float** for currency to support fractional values
- Implement **transaction atomicity** to prevent duplication exploits
- **Validate all constraints** (weight, capacity, solvency, level requirements) before committing
- **Async safety**: Economy operations must be thread-safe with proper locking
- **Audit logging**: Track significant transactions for moderation
- **Graceful degradation**: Handle missing accounts/data corruption
- **Rarity visualization**: Use color-coded embeds and emojis for clear tier communication
- **Slot expansion validation**: Prevent infinite recursion with proper bonus slot checks
- **Exponential curve**: Ensure XP requirements scale dramatically for endgame content

---

## Recent Changes (2026-02-06)

### Trinkets System Overhaul
- Rebranded economy equipment as magical trinkets
- Separated from RPG combat gear to avoid confusion
- Added 5-tier rarity system (Common → Unique)
- Implemented slot expansion mechanics
- Renamed items with better thematic names

### Leveling System Rework
- Reduced max level from 12 to 10
- Implemented exponential XP curve
- Increased total XP for max level from 3,850 to 38,000
- Added difficulty walls at levels 5→6 and 7→8

### New Features
- Dimemorphin Belt: Legendary item with infinite slot expansion
- Rarity-based UI: Color-coded embeds and emojis
- Bonus slot validation: Prevents slot-expanding item recursion
- Unique item framework: Foundation for quest-gated legendary items

---

*Document Version: 2.0*
*Last Updated: 2026-02-06*
