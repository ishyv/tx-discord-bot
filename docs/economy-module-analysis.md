# PyEBot Economy Module - Implementation Analysis

> **Document Purpose**: Comprehensive analysis of the economy module implementation, comparing against ECONOMY_DESIGN.md specifications, assessing efficiency, and identifying areas for improvement.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Implementation vs Design Comparison](#implementation-vs-design-comparison)
4. [Module-by-Module Analysis](#module-by-module-analysis)
5. [Code Quality Assessment](#code-quality-assessment)
6. [Identified Bloat & Redundancies](#identified-bloat--redundancies)
7. [Recommendations](#recommendations)
8. [Appendix: File Inventory](#appendix-file-inventory)

---

## Executive Summary

The PyEBot economy module is a sophisticated, multi-layered system implementing approximately **60-70%** of the features described in ECONOMY_DESIGN.md. The implementation follows modern architectural patterns with clean separation of concerns, type safety via Zod schemas, and proper error handling using Result types.

### Key Metrics

| Aspect | Status | Notes |
|--------|--------|-------|
| Core Currency System | ✅ Implemented | Dual hand/bank system with `coins` currency |
| Guild Economy | ✅ Implemented | 4-sector treasury with configurable tax |
| Daily Rewards | ✅ Implemented | Configurable with fees and sector deposits |
| Work System | ✅ Implemented | Cooldown + daily cap with failure chance |
| User-to-User Transfers | ✅ Implemented | With tax and large transfer alerts |
| Store (Buy/Sell) | ✅ Implemented | Capacity-checked transactions |
| Inventory System | ✅ Implemented | Weight + slot-based capacity |
| Audit Logging | ✅ Implemented | Comprehensive operation tracking |
| Account Status | ✅ Implemented | ok/blocked/banned with access control |
| **XP & Leveling** | ❌ NOT Implemented | Design doc has 12-level system |
| **Streak System** | ❌ NOT Implemented | Daily streak tracking missing |
| **Perks System** | ❌ NOT Implemented | Weight/capacity/luck upgrades |
| **RPG Equipment** | ❌ NOT Implemented | Equipment slots not implemented |
| **Crafting** | ❌ NOT Implemented | Material processing system |
| **Gambling** | ❌ NOT Implemented | Coin flip, steal/rob, trivia |
| **Social Voting** | ❌ NOT Implemented | Love/hate voting system |

---

## Architecture Overview

### Layer Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Commands Layer (src/commands/economy/)                     │
│  - balance, bank, profile                                   │
│  - daily, work                                              │
│  - transfer, deposit, withdraw                              │
│  - store (buy/sell/list)                                    │
│  - economy-config, economy-health, economy-audit            │
├─────────────────────────────────────────────────────────────┤
│  Module Layer (src/modules/economy/)                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Account   │ │  Currency   │ │   Guild     │           │
│  │  (types,    │ │ (registry,  │ │ (sectors,   │           │
│  │  service,   │ │  engine,    │ │  tax,       │           │
│  │  repo)      │ │  coins, rep)│ │  thresholds)│           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  Mutations  │ │    Daily    │ │    Work     │           │
│  │(currency &  │ │  (cooldown  │ │  (cooldown  │           │
│  │  items)     │ │   repo)     │ │   + cap)    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │    Store    │ │    Audit    │ │  Rollback   │           │
│  │ (catalog,   │ │  (logging)  │ │ (correction)│           │
│  │  pricing)   │ │             │ │             │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
├─────────────────────────────────────────────────────────────┤
│  Inventory Module (src/modules/inventory/)                  │
│  - definitions, items, inventory operations                 │
├─────────────────────────────────────────────────────────────┤
│  Data Layer (src/db/)                                       │
│  - schemas (economy-account, guild)                         │
│  - repositories (users, guilds)                             │
│  - mongo-store (persistence)                                │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

1. **Repository Pattern**: All data access goes through repository classes (economyAccountRepo, guildEconomyRepo, etc.)
2. **Service Pattern**: Business logic lives in service classes (currencyMutationService, storeService, etc.)
3. **Result Type**: All async operations return `Result<T, Error>` for explicit error handling
4. **Optimistic Concurrency**: Version-based conflict detection for concurrent modifications
5. **Atomic Updates**: MongoDB `$inc`, `$set`, `findOneAndUpdate` for transaction safety

---

## Implementation vs Design Comparison

### ✅ Fully Implemented Features

#### 1. Account System (Design §User Account System)

| Design Spec | Implementation | Status |
|-------------|----------------|--------|
| Auto-creation on first use | `economyAccountRepo.ensure()` | ✅ |
| Lazy initialization | Account created on first command | ✅ |
| Status tracking (ok/blocked/banned) | `AccountStatusSchema` enum | ✅ |
| Version for optimistic locking | `version` field in account | ✅ |
| Activity timestamp | `lastActivityAt` with touch | ✅ |

**Key Implementation Files:**
- `src/db/schemas/economy-account.ts` - Zod schema with defaults and repair
- `src/modules/economy/account/repository.ts` - Persistence layer
- `src/modules/economy/account/service.ts` - Business logic

**Code Quality Notes:**
- Excellent data repair capability via `repairEconomyAccount()`
- Proper date coercion with `z.coerce.date().catch()`
- Automatic corruption detection

#### 2. Dual Currency Model (Design §Currency System)

| Design Spec | Implementation | Status |
|-------------|----------------|--------|
| Cash (hand) | `CoinValue.hand` | ✅ |
| Bank money | `CoinValue.bank` | ✅ |
| Display formatting | `Coins.display()` | ✅ |
| Validation | `Coins.isValid()` | ✅ |

**Key Implementation:**
```typescript
// src/modules/economy/currencies/coin.ts
export type CoinValue = {
  hand: number;
  bank: number;
  use_total_on_subtract: boolean;  // Smart subtraction flag
};
```

The `use_total_on_subtract` flag is a clever addition not in the design doc - it allows transactions to consider total balance (hand + bank) for sufficiency checks.

#### 3. Guild Economy Sectors (Design §Guild Economy)

| Design Spec | Implementation | Status |
|-------------|----------------|--------|
| global sector | `DEFAULT_SECTOR_BALANCES.global` | ✅ |
| works sector | `DEFAULT_SECTOR_BALANCES.works` | ✅ |
| trade sector | `DEFAULT_SECTOR_BALANCES.trade` | ✅ |
| tax sector | `DEFAULT_SECTOR_BALANCES.tax` | ✅ |
| Tax calculation | `calculateTax()` | ✅ |
| Transfer thresholds | `DEFAULT_TRANSFER_THRESHOLDS` | ✅ |

**Configuration Schema (in Guild):**
```typescript
// From src/db/schemas/guild.ts
economy: {
  daily: DailyConfigSchema,
  work: WorkConfigSchema,
  // sectors stored in separate collection
}
```

#### 4. Daily Rewards (Design §Daily Rewards)

| Design Spec | Implementation | Status |
|-------------|----------------|--------|
| Configurable reward amount | `dailyReward` (default 250) | ✅ |
| Cooldown hours | `dailyCooldownHours` (default 24) | ✅ |
| Atomic claim | `dailyClaimRepo.tryClaim()` | ✅ |
| Fee rate support | `dailyFeeRate` (0-0.2) | ✅ |
| Sector deposit for fees | `dailyFeeSector` | ✅ |

**Key Implementation:**
```typescript
// src/modules/economy/daily/repository.ts
async tryClaim(guildId, userId, cooldownHours): Promise<Result<boolean>>
```

Uses MongoDB `findOneAndUpdate` with upsert for atomic claim acquisition - excellent concurrency handling.

#### 5. Work System (Design §Work System)

| Design Spec | Implementation | Status |
|-------------|----------------|--------|
| Base reward | `workRewardBase` (default 120) | ✅ |
| Cooldown minutes | `workCooldownMinutes` (default 30) | ✅ |
| Daily cap | `workDailyCap` (default 5) | ✅ |
| Pays from sector | `workPaysFromSector` | ✅ |
| Failure chance | `workFailureChance` (default 0.1) | ✅ |
| RNG factor (0.9-1.1) | Implemented in command | ✅ |

**Notable Implementation:**
The work repository handles both cooldown AND daily cap in a single atomic operation using MongoDB aggregation pipeline:

```typescript
// src/modules/economy/work/repository.ts
const result = await col.findOneAndUpdate(
  {
    _id: docId,
    $and: [
      { $or: [{ lastWorkAt: { $lt: cutoff } }, ...] },  // cooldown check
      { $or: [{ dayStamp: { $ne: dayStamp } }, ...] }   // cap check
    ]
  },
  [{
    $set: {
      workCountToday: {
        $cond: [
          { $eq: ["$dayStamp", dayStamp] },
          { $add: [{ $ifNull: ["$workCountToday", 0] }, 1] },
          1
        ]
      }
    }
  }],
  { upsert: true, returnDocument: "after" }
);
```

#### 6. Store/Trading (Design §Trading & Transactions)

| Design Spec | Implementation | Status |
|-------------|----------------|--------|
| Catalog with items | `StoreCatalog` interface | ✅ |
| Buy price | `buyPrice` in StoreItem | ✅ |
| Sell price (~85%) | `sellPrice` with default 0.85x | ✅ |
| Stock tracking | `stock` field (-1 = unlimited) | ✅ |
| Tax on transactions | Applied via guildEconomyService | ✅ |
| Capacity pre-check | `simulateCapacityAfterAdd()` | ✅ |
| Guild liquidity check | Trade sector balance check | ✅ |

**Transaction Flow (Buy):**
1. Validate store active and item available
2. Check stock
3. Calculate price with tax
4. Check buyer capacity
5. Transfer payment (buyer → guild)
6. Deposit to guild trade sector
7. Decrement stock
8. Grant items
9. Create audit entry

**Transaction Flow (Sell):**
1. Validate store active
2. Check seller inventory
3. Calculate sale value
4. Apply tax
5. Check guild liquidity (trade sector)
6. Remove items from seller
7. Withdraw from guild trade sector
8. Pay seller
9. Increment stock
10. Create audit entry

Both flows have rollback mechanisms for partial failures.

#### 7. Inventory System (Design §Inventory System)

| Design Spec | Implementation | Status |
|-------------|----------------|--------|
| Weight-based capacity | `maxWeight: 200` | ✅ |
| Slot-based capacity | `maxSlots: 20` | ✅ |
| Stackable items | `canStack` property | ✅ |
| Non-stackable items | Single slot per unit | ✅ |
| Auto-cleanup at zero | `removeItem()` deletes at 0 | ✅ |

**Implementation:**
```typescript
// src/modules/inventory/definitions.ts
export const DEFAULT_INVENTORY_CAPACITY = {
  maxWeight: 200,
  maxSlots: 20,
};
```

**Notable Feature:** The capacity system correctly handles the slot counting difference between stackable (1 slot per item type) and non-stackable (1 slot per unit) items.

---

### ❌ Missing Features (from Design)

#### 1. XP & Leveling System (Design §Experience & Leveling)

**Design Spec:**
- 12 levels (0-12+) with XP requirements
- Level-up rewards (money, perks)
- Random XP gain (1-5 per action)
- Luck bonus affects success chance

**Current State:** NOT IMPLEMENTED

**Gap Analysis:**
- No XP tracking in user schema
- No level calculation logic
- No reward distribution on level-up
- Would need: `xp`, `level` fields in economy account

#### 2. Streak System (Design §Daily Rewards)

**Design Spec:**
- Consecutive daily claims tracked
- Progressive scaling: Day 1 = 500, Day 30 = 15,000
- Post-30 cap at 17,777
- 24h+ gap resets to 0

**Current State:** NOT IMPLEMENTED

**Current daily command uses flat reward:**
```typescript
const { dailyReward } = config.daily;  // Fixed amount
```

**Gap Analysis:**
- No streak tracking in daily claim record
- No progressive reward calculation

#### 3. Perks System (Design §Perks System)

**Design Spec:**
| Perk | Effect | Upgrade Cost |
|------|--------|--------------|
| peso (weight) | Max inventory weight | 10K + materials |
| capacidad (capacity) | Max item slots | 20K + materials |
| suerte (luck) | Success chance bonus | 30K + materials |

**Current State:** NOT IMPLEMENTED

**Gap Analysis:**
- No perks storage in user schema
- No upgrade mechanism
- Item definitions don't have material requirements

#### 4. RPG Equipment System (Design §RPG Equipment System)

**Design Spec:**
- Equipment slots: Weapon, Shield, Helmet, Chest, Pants, Boots, Ring, Necklace
- Stats: atk, def, hp
- Equip/Unequip flow

**Current State:** NOT IMPLEMENTED

**Gap Analysis:**
- No equipment slots in user schema
- Item definitions lack RPG stats
- No equip/unequip commands

#### 5. Gambling Features (Design §Gambling Features)

| Game | Design Spec | Status |
|------|-------------|--------|
| Coin Flip | 50/50, 95% return | ❌ Missing |
| Steal/Rob | 35% max cash steal, fine on fail | ❌ Missing |
| Trivia | 4 choices, 500-1000 reward | ❌ Missing |

#### 6. Crafting System (Design §Item/Object System)

**Design Spec:**
- 2 raw → 1 processed material
- Monetary fee (percentage of output)
- Failure chance
- Luck influence

**Current State:** NOT IMPLEMENTED

---

## Module-by-Module Analysis

### 1. Currency System (`src/modules/economy/currency.ts`)

**Purpose**: Abstract currency interface for extensibility

```typescript
export interface Currency<TValue> {
  readonly id: CurrencyId;
  zero(): TValue;
  display(value: TValue): string;
  add(a: TValue, b: TValue): TValue;
  sub(a: TValue, b: TValue): TValue;
  isValid(value: TValue): boolean;
}
```

**Assessment**: ✅ Clean, extensible design. Type-safe via TypeScript generics.

**Registered Currencies:**
| Currency | Type | Implementation |
|----------|------|----------------|
| `coins` | `CoinValue` | Hand/bank object |
| `rep` | `number` | Simple numeric |

### 2. Currency Engine (`src/modules/economy/transactions.ts`)

**Purpose**: Apply transactions atomically with optimistic concurrency

```typescript
export type Transaction = {
  costs?: CurrencyAmount[];      // What gets deducted
  rewards?: CurrencyAmount[];    // What gets added
  allowDebt?: boolean;           // Allow negative balances
};
```

**Key Method:**
```typescript
async function currencyTransaction(
  userId: string,
  tx: Transaction,
  engine: CurrencyEngine = currencyEngine
): Promise<TransactionResult>
```

**Assessment**: ✅ Well-designed with optimistic concurrency via `runUserTransition`. The CAS (compare-and-swap) pattern prevents lost updates.

**Potential Issue**: The retry loop is implicit in `runUserTransition`. If there are high concurrency conflicts, this could generate multiple DB round-trips.

### 3. Account Repository (`src/modules/economy/account/repository.ts`)

**Key Features:**
- Lazy initialization via `ensure()`
- Automatic corruption detection and repair
- Optimistic concurrency for status updates
- Fire-and-forget activity touching

**Assessment**: ✅ Solid implementation. The repair functionality is production-ready.

### 4. Guild Economy Repository (`src/modules/economy/guild/repository.ts`)

**Key Features:**
- 4-sector balance tracking
- Atomic deposit/withdraw operations
- Tax and threshold configuration
- Daily and work config updates

**Assessment**: ✅ Good atomic operations. Uses MongoDB `$inc` for sector updates.

### 5. Store Service (`src/modules/economy/store/service.ts`)

**Transaction Safety:**
The buy/sell operations implement proper rollback mechanisms:

```typescript
// From buyItem() - if item grant fails after payment
if (itemResult.isErr()) {
  await currencyMutationService.transferCurrency({
    senderId: guildId,
    recipientId: buyerId,
    amount: pricing.total,
    reason: `Refund for failed purchase`,
  });
}
```

**Assessment**: ✅ Production-ready with rollback logic. Comprehensive audit logging.

### 6. Audit Repository (`src/modules/economy/audit/repository.ts`)

**Operation Types Tracked:**
```typescript
operationType: z.enum([
  "currency_adjust",
  "currency_transfer",
  "item_grant",
  "item_remove",
  "item_purchase",
  "item_sell",
  "config_update",
  "daily_claim",
  "work_claim",
  "rollback",
])
```

**Indexes Created:**
- `target_time_idx` - For user audit history
- `actor_time_idx` - For moderator action logs
- `guild_time_idx` - For guild-scoped queries
- `optype_time_idx` - For operation type filtering
- `correlation_time_idx` - For linking related operations
- `transfer_time_idx` - For transfer lookups
- `transaction_time_idx` - For transaction correlation

**Assessment**: ✅ Excellent audit coverage. Proper indexing for query performance.

---

## Code Quality Assessment

### Strengths

1. **Type Safety**: Extensive use of Zod schemas with `.catch()` for graceful degradation
2. **Error Handling**: Consistent `Result<T, Error>` pattern throughout
3. **Documentation**: JSDoc comments explain purpose, dependencies, invariants, and gotchas
4. **Concurrency Safety**: Optimistic locking with version checks
5. **Audit Trail**: Every mutation is logged with before/after states
6. **Rollback Support**: Partial failures have compensation logic

### Areas for Improvement

1. **Magic Numbers**: Some hardcoded defaults scattered across files
2. **String Concatenation**: Some places use template strings for DB paths that could be typed
3. **Test Coverage**: No visible unit tests for economy module (tests/ folder empty)

---

## Identified Bloat & Redundancies

### 1. Duplicate Capacity Calculation Logic

**Location:** 
- `src/modules/economy/store/service.ts` - `calculateCapacity()`
- `src/modules/economy/mutations/items/service.ts` - `calculateCapacity()`

**Issue**: Nearly identical functions (lines 37-64 in store vs lines 32-65 in mutations)

**Recommendation**: Extract to shared utility in `src/modules/inventory/capacity.ts`

### 2. Currency Registry Ambiguity

**Issue**: Two registries exist:
- `src/modules/economy/currencyRegistry.ts` - For Currency instances
- `src/modules/economy/transactions.ts` - Exports its own registry

**Potential Confusion**: Both export `currencyRegistry` but the latter re-exports from the former.

### 3. Unused Default Exports

**Location**: `src/modules/economy/guild/repository.ts` lines 107-116

```typescript
// function toData(config: GuildEconomyConfig): GuildEconomyData {
//   return { ... };
// }
```

This commented function suggests incomplete refactoring.

### 4. Redundant Type Definitions

**Location**: `src/modules/economy/store/types.ts`

```typescript
export type ItemId = InventoryItemId;  // Re-export
```

Then imports use `ItemId` from store types, but definitions come from inventory module. Direct import would be clearer.

### 5. Overly Complex Transfer Currency Logic

**Location**: `src/modules/economy/mutations/service.ts` lines 324-588

The `transferCurrency` method has ~260 lines with two separate code paths:
1. Simple numeric currencies (using `$inc`)
2. Complex currencies (using `currencyTransaction`)

**Suggestion**: Extract the two paths into separate private methods for readability.

### 6. Shared.ts Command Utilities

**Location**: `src/commands/economy/shared.ts`

This file contains shared parsing utilities but is only imported by deposit/withdraw. The parsing logic could be moved to the module layer for broader reuse.

### 7. Unused Import in Daily Command

**Location**: `src/commands/economy/daily.ts` line 18

```typescript
import { currencyRegistry } from "@/modules/economy/transactions";
```

This is imported but not used (the command uses the registry indirectly via service).

---

## Recommendations

### High Priority

1. **Implement XP/Leveling System**
   - Add `xp` and `level` to economy account schema
   - Create XP gain hooks in work/daily commands
   - Add level-up reward distribution

2. **Add Streak Tracking to Daily**
   - Extend `DailyClaimRecord` with streak fields
   - Implement progressive reward calculation

3. **Extract Duplicate Capacity Logic**
   ```typescript
   // src/modules/inventory/capacity.ts
   export function calculateCapacity(inventory: ItemInventory): CapacityStats;
   export function simulateCapacityAfterAdd(...): CapacitySimulation;
   ```

### Medium Priority

4. **Add Gambling Commands**
   - `/coinflip` - Simple 50/50 with tax
   - `/trivia` - Multiple choice questions

5. **Implement Perks System**
   - Add perks object to user schema
   - Create `/upgrade` command

6. **Add Unit Tests**
   - Test currency engine calculations
   - Test capacity constraints
   - Test transaction atomicity

### Low Priority

7. **Refactor Transfer Currency Method**
   - Split into `transferSimpleCurrency` and `transferComplexCurrency`

8. **Remove/Consolidate Duplicate Registries**
   - Ensure single source of truth for currency registry

9. **Clean Up Unused Code**
   - Remove commented `toData` function
   - Remove unused imports

---

## Appendix: File Inventory

### Commands (33 files)

| File | Purpose | Lines |
|------|---------|-------|
| `balance.ts` | Display user balance | 99 |
| `bank.ts` | Display bank breakdown | 114 |
| `daily.ts` | Claim daily reward | 222 |
| `work.ts` | Work for guild payout | 282 |
| `transfer.ts` | User-to-user transfer | 178 |
| `deposit.ts` | Hand → Bank | 93 |
| `withdraw.ts` | Bank → Hand | 94 |
| `store.ts` | Store buy/sell/list | 304 |
| `profile.ts` | Full economy profile | 101 |
| `give-currency.ts` | Admin grant | ~150 |
| `remove-currency.ts` | Admin deduct | ~150 |
| `economy-config/*` | 10 config commands | ~400 |
| `economy-audit/*` | Audit queries | ~200 |
| `economy-health.ts` | Guild economy status | ~100 |
| `economy-sectors.ts` | Sector management | ~150 |
| `economy-rollback.ts` | Transaction rollback | ~200 |
| `shop.ts` | Store alias | ~50 |
| `shared.ts` | Command utilities | ~100 |

### Module Layer (54 files)

| Directory | Files | Purpose |
|-----------|-------|---------|
| `account/` | 5 | Account lifecycle, views, formatting |
| `audit/` | 3 | Audit logging repository |
| `currencies/` | 2 | Coin and reputation implementations |
| `daily/` | 3 | Daily claim cooldown repository |
| `guild/` | 4 | Guild economy, sectors, tax |
| `mutations/` | 6 | Currency and item mutation services |
| `rollback/` | 2 | Transaction rollback service |
| `store/` | 4 | Store catalog and transactions |
| `views/` | 5 | View builders (balance, bank, inventory, profile) |
| `work/` | 2 | Work claim repository |

### Schemas (1 file)

| File | Purpose |
|------|---------|
| `economy-account.ts` | Zod schema with corruption detection/repair |

---

## Conclusion

The PyEBot economy module is a **well-architected, production-ready implementation** covering the essential features of a Discord economy system. The codebase demonstrates:

- ✅ Solid architectural patterns (Repository, Service, Result types)
- ✅ Proper concurrency handling (optimistic locking)
- ✅ Comprehensive audit logging
- ✅ Type safety via Zod schemas
- ✅ Good separation of concerns

**Main gaps** are in "gameplay" features (XP, perks, gambling, crafting) which are well-defined in the design document but not yet implemented. The existing foundation would support these additions with minimal refactoring.

**Bloat is minimal** - the main issues are some duplicate utility functions and a few unused imports/comments. No major architectural debt detected.

---

*Document generated: 2026-01-30*
*Analysis scope: ECONOMY_DESIGN.md vs src/modules/economy + src/commands/economy*
