# PyEBot - RPG System Design Document

> **Purpose**: This document describes the complete architecture and design of the PyEBot Discord bot's RPG system, including commands, modules, APIs, integration points, and design decisions.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Commands](#commands)
4. [Modules](#modules)
5. [Integration Points](#integration-points)
6. [Core Mechanics](#core-mechanics)
7. [Design Decisions](#design-decisions)
8. [Data Flow](#data-flow)
9. [Configuration](#configuration)

---

## System Overview

The RPG system is a comprehensive module built on top of the economy system, providing combat, gathering, crafting, and equipment management features. It operates alongside the economy system, creating a dual-layer character progression where economy success enables RPG advancement.

### Key Principles

1. **Economy-RPG Bridge**: RPG progression requires economic investment (tools, materials, upgrades)
2. **Instance-Based Equipment**: Tools have durability and are managed as unique instances
3. **Persistent Combat**: Combat state stored in MongoDB with TTL expiration
4. **Content-First**: Drop tables, recipes, and locations driven by content registry
5. **Audit Trail**: All significant operations logged for moderation and analytics

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Discord Commands                        │
│  /rpg profile  /rpg equip  /rpg unequip  /fight             │
│  /mine  /cutdown  /process  /upgrade-tool                   │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                      Service Layer                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │RpgProfile    │ │RpgEquipment  │ │RpgFightService       │ │
│  │Service       │ │Service       │ │                      │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │RpgGathering  │ │RpgProcessing │ │RpgUpgradeService     │ │
│  │Service       │ │Service       │ │                      │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    Repository Layer                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │RpgProfileRepo│ │RpgFightRepo  │ │RpgConfigRepo         │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   Integration Layer                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │EconomySystem │ │Inventory     │ │ContentRegistry       │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Module Structure

```
src/modules/rpg/
├── index.ts                    # Public API exports
├── types.ts                    # Core RPG type definitions
├── config.ts                   # Centralized configuration
│
├── profile/                    # Profile management
│   ├── service.ts              # Profile operations
│   ├── repository.ts           # Persistence with optimistic concurrency
│   └── types.ts                # Domain types
│
├── equipment/                  # Equipment management
│   ├── service.ts              # Equip/unequip operations
│   └── validation.ts           # Equipment validation
│
├── combat/                     # Combat system
│   ├── engine.ts               # Pure combat calculations
│   ├── fight-service.ts        # Persistent fight orchestration
│   ├── fight-repository.ts     # Fight data persistence
│   └── session.ts              # Session management
│
├── gathering/                  # Resource gathering
│   ├── service.ts              # Mining/woodcutting logic
│   └── definitions.ts          # Locations and yields
│
├── processing/                 # Material processing
│   ├── service.ts              # Processing logic
│   └── recipes.ts              # Material mappings
│
├── upgrades/                   # Tool upgrades
│   ├── service.ts              # Upgrade logic
│   └── definitions.ts          # Upgrade costs
│
├── stats/                      # Statistics calculation
│   └── calculator.ts           # Pure stat functions
│
├── onboarding/                 # New user onboarding
│   └── service.ts              # Starter kit granting
│
├── config/                     # Guild configuration
│   ├── service.ts              # Config management
│   └── defaults.ts             # Default values
│
└── views/                      # UI components
    ├── embeds.ts               # Discord embeds
    ├── hp-bar.ts               # HP bar rendering
    └── combat-log.ts           # Combat log formatting
```

---

## Commands

### Profile Commands

| Command | File | Description | Cooldown |
|---------|------|-------------|----------|
| `/rpg profile` | `profile.command.ts` | Display RPG profile with stats, equipment, and combat record | None |
| `/rpg profile [@user]` | `profile.command.ts` | View another user's profile | None |

**Features:**
- Shows equipped items in all 8 slots
- Displays calculated stats (ATK, DEF, HP)
- Shows combat record (wins/losses)
- Triggers onboarding for new users

### Equipment Commands

| Command | File | Description | Cooldown |
|---------|------|-------------|----------|
| `/rpg equip` | `equip.command.ts` | Equip items from inventory | 3s |
| `/rpg unequip [slot]` | `unequip.command.ts` | Unequip items | 3s |

**Equipment Slots:**
1. **Weapon** - Primary ATK source
2. **Shield** - Enables blocking, DEF bonus
3. **Helmet** - DEF bonus
4. **Chest** - Major DEF bonus
5. **Pants** - DEF bonus
6. **Boots** - Minor DEF bonus
7. **Ring** - Variable bonuses
8. **Necklace** - Variable bonuses

**Features:**
- Interactive slot selection
- Equipment preview with stat comparison
- Combat lock (cannot change while fighting)
- Automatic HP clamping when max HP changes

### Gathering Commands

| Command | File | Description | Cooldown |
|---------|------|-------------|----------|
| `/mine [location]` | `mine.ts` | Mine ores at selected location | 60s |
| `/cutdown [forest]` | `cutdown.ts` | Cut wood at selected forest | 60s |

**Tool Requirements:**
- Mining requires equipped pickaxe
- Woodcutting requires equipped axe
- Tool tier must match location tier
- Each use consumes 1 durability

**Location Tiers:**
| Tier | Mining | Woodcutting |
|------|--------|-------------|
| 1 | Stone Quarry | Oak Grove |
| 2 | Copper Mine | Spruce Forest |
| 3 | Iron Mine | Palm Grove |
| 4 | Silver Mine | Pine Forest |

### Processing Command

| Command | File | Description | Cooldown |
|---------|------|-------------|----------|
| `/process [material] [amount]` | `process.ts` | Process raw materials | 30s |

**Processing Rules:**
- 2 raw → 1 processed
- 62% base success rate
- Luck bonus: +1% per level (max +25%)
- Fee: 10% of material value to guild economy

**Recipes:**
| Raw | Processed |
|-----|-----------|
| Copper Ore | Copper Ingot |
| Iron Ore | Iron Ingot |
| Silver Ore | Silver Ingot |
| Gold Ore | Gold Ingot |
| Oak Wood | Processed Oak |
| Spruce Wood | Processed Spruce |
| Palm Wood | Processed Palm |
| Pine Wood | Processed Pine |

### Combat Command

| Command | File | Description | Cooldown |
|---------|------|-------------|----------|
| `/fight challenge @user` | `fight.ts` | Challenge user to combat | None |
| `/fight accept` | `fight.ts` | Accept pending challenge | None |
| `/fight status` | `fight.ts` | View current fight status | None |
| `/fight move [move]` | `fight.ts` | Submit combat move | None |
| `/fight forfeit` | `fight.ts` | Surrender current fight | None |

**Combat Moves:**
- **Attack** - Standard damage (95-125% of ATK)
- **Block** - 50% chance to negate damage (requires shield)
- **Critical** - 20% chance for 150-200% damage

**Combat Flow:**
1. Challenger initiates with `/fight challenge`
2. Target accepts with `/fight accept`
3. Both players submit moves simultaneously
4. Round resolves after both moves submitted (or timeout)
5. Combat ends when HP ≤ 0 or forfeit

### Upgrade Command

| Command | File | Description | Cooldown |
|---------|------|-------------|----------|
| `/upgrade-tool` | `upgrade-tool.ts` | Upgrade equipped tool | None |

**Upgrade Path:**
```
Tier 1 → Tier 2 → Tier 3 → Tier 4
```

**Upgrade Costs:**
| Upgrade | Money | Materials |
|---------|-------|-----------|
| 1→2 | 10,000 | 5x Tier 2 wood |
| 2→3 | 20,000 | 5x Tier 2 ingot |
| 3→4 | 30,000 | 5x Tier 3 wood |

---

## Modules

### Profile Module (`profile/`)

**Responsibilities:**
- RPG profile lifecycle management
- Stat calculation from equipment
- Integration with economy account system

**Key Classes:**
```typescript
class RpgProfileService {
  ensureProfile(guildId, userId): Promise<RpgProfile>
  ensureAndGate(guildId, userId): Promise<RpgProfile>  // Blocks banned/blocked
  getComputedStats(profile): CombatStats
  equip(profile, slot, item): Promise<void>
  unequipAll(profile): Promise<void>
}
```

**Design Decision:** Profile service gates RPG access based on economy account status. Banned/blocked economy accounts cannot use RPG features.

### Equipment Module (`equipment/`)

**Responsibilities:**
- Equipment changes with inventory integration
- Combat lock enforcement
- Instance-based tool handling

**Key Features:**
- Atomic transitions using `runUserTransition()`
- Automatic HP clamping when max HP changes
- Capacity validation before unequipping
- Durability tracking for tools

**Design Decision:** Equipment changes are atomic operations with rollback capability. This prevents inventory duplication exploits.

### Combat Module (`combat/`)

**Responsibilities:**
- Turn-based combat resolution
- Persistent fight state management
- Combat calculations

**Architecture:**
```
CombatEngine (pure functions)
    ↓
RpgFightService (orchestration)
    ↓
RpgFightRepo (persistence)
```

**CombatEngine** (`engine.ts`):
- Pure functions for deterministic calculations
- Seeded RNG (Mulberry32) for reproducibility
- Damage formulas with variance

**RpgFightService** (`fight-service.ts`):
- MongoDB-backed persistent state
- TTL expiration (5 minutes)
- Round timeout handling (60 seconds)
- Atomic operations for move submission

**Design Decision:** Combat state is persisted to MongoDB rather than held in memory. This allows bot restarts without losing combat state and enables horizontal scaling.

### Gathering Module (`gathering/`)

**Responsibilities:**
- Mining and woodcutting operations
- Tool durability management
- Drop table resolution

**Key Features:**
- Content-first drop tables with legacy fallback
- Tool breaking at 0 durability
- Yields 2-5 materials per success
- Cooldown enforcement

**Design Decision:** Gathering uses content registry for drop tables, allowing dynamic content updates without code changes.

### Processing Module (`processing/`)

**Responsibilities:**
- Material processing (raw → refined)
- Success chance calculation
- Fee collection

**Key Features:**
- 62% base success rate
- Luck modifier from progression level
- Batch processing support
- Guild economy integration (fees)

**Design Decision:** Processing fees go to guild economy trade sector, creating a resource sink and guild revenue stream.

### Upgrades Module (`upgrades/`)

**Responsibilities:**
- Tool tier progression
- Cost validation
- Auto-equip after upgrade

**Key Features:**
- Consumes tool instance + materials + money
- Full durability restoration
- Rollback on failure

---

## Integration Points

### Economy System Integration

| RPG Feature | Economy Integration |
|-------------|---------------------|
| Profile | `economyAccountRepo` - Account status gating |
| Equipment | `perkService` - Capacity limits |
| Gathering | `itemMutationService` - Material grants |
| Processing | `currencyMutationService` - Fees, `guildEconomyService` - Guild revenue |
| Upgrades | `currencyMutationService` - Costs |
| Combat | `economyAuditRepo` - Audit trail |

**Design Decision:** RPG system cannot function without economy system. All RPG operations validate economy account status first.

### Inventory System Integration

**Modern Inventory (Current):**
```typescript
// Instance-based tool storage
itemInstanceService.createInstance(definition, durability)
itemMutationService.addInstance(userId, instance)
itemMutationService.removeInstanceById(userId, instanceId)

// Capacity checking
simulateModernCapacityAfterAdd(inventory, item, quantity)
```

**Legacy Inventory (Deprecated):**
```typescript
// String-based storage (being migrated)
inventory[itemId] = { id: itemId, quantity: number }
```

**Design Decision:** Tools are stored as instances with unique IDs and durability, separate from stackable items. This enables per-tool durability tracking.

### Content System Integration

**Content Registry:**
```typescript
// Drop tables for gathering
registry.getDrops(activity, locationTier, luckBonus)

// Processing recipes
registry.findProcessingRecipeByInput(materialId)

// Locations
registry.getLocations(activityType)
```

**Design Decision:** Content is JSON-driven, allowing non-developers to modify drop rates, locations, and recipes.

### Database Schema

**User Document:**
```typescript
{
  _id: ObjectId,
  userId: string,
  inventory: ItemInventory,
  rpgProfile: {
    equipment: {
      weapon?: string,      // instanceId
      shield?: string,
      helmet?: string,
      chest?: string,
      pants?: string,
      boots?: string,
      ring?: string,
      necklace?: string
    },
    stats: {
      hp: number,
      maxHp: number,
      wins: number,
      losses: number
    },
    isFighting: boolean
  }
}
```

**Fight Collection:**
```typescript
{
  _id: ObjectId,
  guildId: string,
  challengerId: string,
  targetId: string,
  status: "pending" | "active" | "completed",
  round: number,
  challengerHp: number,
  targetHp: number,
  moves: [...],
  expiresAt: Date  // TTL index
}
```

---

## Core Mechanics

### Character Stats

**Base Stats:**
- HP: 100 (current)
- Max HP: 100
- ATK: 0
- DEF: 0

**Stat Calculation:**
```
ATK = Σ(equipped_items.atk)
DEF = Σ(equipped_items.def)
MAX_HP = 100 + Σ(equipped_items.hp)
```

**HP Clamping:**
- Current HP never exceeds Max HP
- When Max HP decreases, current HP is clamped
- Full HP restore after combat

### Combat Mechanics

**Damage Formula:**
```
// Normal Attack
baseDamage = random(ATK * 0.95, ATK * 1.25)

// Critical Hit (20% chance)
critDamage = random(ATK * 1.5, ATK * 2.0)

// Defense Reduction
reduction = random(DEF * 0.5, DEF)
finalDamage = max(1, damage - reduction)

// Block (50% chance with shield)
blockedDamage = finalDamage * random(0.0, 0.3)  // 70-100% reduction
```

**Combat Flow:**
1. Both players submit moves
2. Moves revealed simultaneously
3. Damage calculated for both
4. HP updated simultaneously
5. Check for KO
6. Next round or combat end

### Tool Durability

**Durability by Tier:**
| Tier | Durability |
|------|------------|
| 1 | 10 uses |
| 2 | 25 uses |
| 3 | 50 uses |
| 4 | 70 uses |

**Breakage:**
- Tool breaks at 0 durability
- Broken tool removed from inventory
- User must acquire new tool

### Gathering Yields

**Base Yield:** 2-5 materials per success

**Luck Influence:**
- Luck perk increases yield quality
- Drop tables have tier-based weights
- Higher luck = better material chances

---

## Design Decisions

### 1. Instance-Based Tool Storage

**Decision:** Tools are stored as instances with unique IDs and durability, not as stackable quantities.

**Rationale:**
- Enables per-tool durability tracking
- Supports tool upgrades (each upgrade creates new instance)
- Prevents durability exploits

**Trade-offs:**
- More complex inventory management
- Higher database storage
- Requires migration from legacy string-based storage

### 2. Persistent Combat State

**Decision:** Combat state stored in MongoDB with TTL, not in-memory.

**Rationale:**
- Survives bot restarts
- Enables horizontal scaling
- No memory leaks from abandoned fights

**Trade-offs:**
- Higher database load
- Latency for combat operations
- Requires TTL management

### 3. Content-First Architecture

**Decision:** Drop tables, recipes, and locations driven by content registry.

**Rationale:**
- Non-developers can balance content
- A/B testing support
- Dynamic events possible

**Trade-offs:**
- Runtime performance cost
- Complexity in fallback handling
- Content validation required

### 4. Economy-RPG Coupling

**Decision:** RPG system requires functional economy account.

**Rationale:**
- Prevents RPG-only exploits
- Encourages engagement with both systems
- Shared audit trail

**Trade-offs:**
- Economy downtime affects RPG
- More complex error handling
- Tighter coupling

### 5. Optimistic Concurrency Control

**Decision:** Use `runUserTransition()` for atomic user document updates.

**Rationale:**
- Prevents race conditions
- Rollback capability
- Version-based conflict detection

**Trade-offs:**
- Retry logic complexity
- Performance overhead
- Conflict resolution needed

### 6. Pure Function Combat Engine

**Decision:** Combat calculations are pure functions with seeded RNG.

**Rationale:**
- Deterministic and testable
- Reproducible results
- Easy to balance

**Trade-offs:**
- Cannot use true randomness
- Must seed RNG with combat ID
- More complex to implement

---

## Data Flow

### Equipment Change Flow

```
1. User runs /rpg equip
   ↓
2. Validate not in combat
   ↓
3. Check inventory has item
   ↓
4. Calculate new stats
   ↓
5. runUserTransition():
   a. Get current user snapshot
   b. Validate capacity for unequip
   c. Update equipment slot
   d. Update inventory
   e. Clamp HP if needed
   f. Commit with version check
   ↓
6. Log to audit repo
   ↓
7. Return success with stat changes
```

### Combat Round Flow

```
1. Player 1 submits move
   ↓
2. Store move in fight document
   ↓
3. Check if Player 2 submitted
   ↓
4. If both moves submitted:
   a. CombatEngine.resolveRound()
   b. Calculate damage for both
   c. Update HP values
   d. Check for KO
   e. Update win/loss records
   f. Archive fight
   ↓
5. If timeout:
   a. Forfeit non-responsive player
   b. Award win to responsive player
```

### Gathering Flow

```
1. User runs /mine
   ↓
2. Validate has equipped pickaxe
   ↓
3. Validate tool tier >= location tier
   ↓
4. Check cooldown
   ↓
5. runUserTransition():
   a. Decrement tool durability
   b. Remove tool if broken
   c. Generate drops from content registry
   d. Add materials to inventory
   e. Check capacity
   ↓
6. Log to audit repo
   ↓
7. Return results
```

---

## Configuration

### Combat Configuration

```typescript
const COMBAT_CONFIG = {
  baseMaxHp: 100,
  critChance: 0.2,
  critMultiplier: { min: 1.5, max: 2.0 },
  blockChance: 0.5,
  blockReduction: { min: 0.7, max: 1.0 },
  damageVariance: { min: 0.95, max: 1.25 },
  defenseVariance: { min: 0.5, max: 1.0 },
  sessionTtlMinutes: 5,
  roundTimeoutSeconds: 60,
  maxRounds: 50
};
```

### Gathering Configuration

```typescript
const GATHERING_CONFIG = {
  baseYield: { min: 2, max: 5 },
  durabilityByTier: [10, 25, 50, 70],
  cooldownSeconds: 60
};
```

### Processing Configuration

```typescript
const PROCESSING_CONFIG = {
  baseSuccessRate: 0.62,
  luckMultiplier: 0.01,  // +1% per luck level
  maxLuckBonus: 0.25,    // Max +25%
  feePercentage: 0.10,   // 10% fee
  cooldownSeconds: 30
};
```

### Upgrade Configuration

```typescript
const UPGRADE_CONFIG = {
  maxTier: 4,
  costs: [
    { money: 10000, materials: [{ item: "oak_wood", quantity: 5 }] },
    { money: 20000, materials: [{ item: "copper_ingot", quantity: 5 }] },
    { money: 30000, materials: [{ item: "spruce_wood", quantity: 5 }] }
  ]
};
```

---

## Implementation Notes

### Error Handling

All services use Result types:
```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Usage
const result = await rpgProfileService.ensureProfile(guildId, userId);
if (result.isErr()) {
  return handleError(result.error);
}
const profile = result.value;
```

### Audit Trail

All significant operations are audited:
```typescript
economyAuditRepo.log({
  type: "rpg_equip",
  userId,
  guildId,
  metadata: { itemId, slot, previousItemId },
  correlationId
});
```

### Testing

Combat engine is fully testable:
```typescript
// Deterministic with seed
const result = CombatEngine.resolveRound({
  seed: "combat_123",
  challenger: { atk: 10, def: 5, hp: 100 },
  target: { atk: 8, def: 6, hp: 100 },
  moves: { challenger: "attack", target: "block" }
});
```

---

## Future Extensions

### Planned Features

1. **Skills System**
   - Active skills (combat abilities)
   - Passive skills (permanent bonuses)
   - Skill trees

2. **Monster Combat**
   - PvE combat against AI monsters
   - Dungeon instances
   - Boss fights

3. **Crafting Expansion**
   - Equipment crafting
   - Consumable crafting
   - Recipe discovery

4. **Guild RPG Features**
   - Guild raids
   - Shared progression
   - Guild-specific content

5. **Seasonal Content**
   - Limited-time locations
   - Event-specific materials
   - Seasonal leaderboards

---

*Document Version: 2.0*
*Last Updated: 2026-02-06*
*System: PyEBot RPG Module*
