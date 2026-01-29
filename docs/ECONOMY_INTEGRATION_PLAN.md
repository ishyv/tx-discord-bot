# Economy Core Account Integration Plan

## Phase 1: Discovery Summary

This document describes the current economy implementation and proposes a minimal, composable architecture to add core account management with read-only views.

---

## 1. Current Implementation Documentation

### 1.1 Where Economy Data Lives

**Database Layer:**
- **Collection:** `users` (MongoDB)
- **Schema:** `src/db/schemas/user.ts` - `UserSchema` with Zod validation
- **Repository:** `src/db/repositories/users.ts` - `UserStore` (MongoStore instance)

**Data Shape:**
```typescript
// User document (simplified)
{
  _id: string,                    // Discord user ID
  currency: Record<string, unknown>,  // Currency inventory (dynamic)
  inventory: Record<string, unknown>, // Item inventory
  rep: number (legacy),           // Migrated to currency.rep
  warns: Warn[],
  sanction_history: Record<guildId, SanctionHistoryEntry[]>,
  openTickets: string[]
}
```

**Currency Inventory Structure:**
```typescript
// currency field (CurrencyInventory = Record<string, unknown>)
{
  coins: { hand: number, bank: number, use_total_on_subtract: boolean },
  rep: number  // Reputation as simple number
}
```

**Item Inventory Structure:**
```typescript
// inventory field (ItemInventory = Record<string, InventoryItem>)
{
  "palo": { id: "palo", quantity: 5 },
  "potion": { id: "potion", quantity: 2 }
}
```

### 1.2 Current Account Structure

**There is NO explicit "account" entity.** The "account" is implicitly:
- A user document in the `users` collection
- Lazy-initialized via `UserStore.ensure(userId)` which creates defaults if missing
- Currency balances live in `user.currency[currencyId]`
- Item balances live in `user.inventory[itemId]`

**Current Currencies (registered in `CurrencyRegistry`):**
- `coins` (`CoinValue`: hand/bank split with smart subtraction)
- `rep` (`number`: simple reputation counter)

### 1.3 How Commands Call Services and Services Call Repositories

**Command → Repository Flow:**
```
Command (balance.ts)
  └→ UserStore.ensure(userId)           // Get/create user
       └→ MongoStore.ensure()           // DB read + defaults
  └→ buildBalanceFields(currency)      // Pure formatter
```

**Command → Service → Repository Flow (Transactions):**
```
Command (deposit.ts)
  └→ currencyTransaction(userId, tx)   // src/modules/economy/transactions.ts
       └→ runUserTransition()          // Optimistic concurrency
            ├→ UserStore.ensure()      // Read current state
            ├→ CurrencyEngine.apply()  // Compute next state
            ├→ UserStore.replaceIfMatch()  // CAS write
            └→ Return updated currency
```

**Key Transaction Pattern:**
- Uses `runUserTransition` helper for optimistic concurrency
- Compare-and-swap (CAS) via `replaceIfMatch(expected, next)`
- 3-5 retry attempts before failing with conflict error

### 1.4 Existing Invariants and Failure Modes

**Invariants:**
1. Currency values must pass `currency.isValid()` after operations
2. No negative balances unless `allowDebt: true` in transaction
3. Item quantities are integers, zero entries are auto-cleaned
4. Concurrent writes use CAS to prevent lost updates

**Failure Modes:**
| Error | Cause | Handling |
|-------|-------|----------|
| `CURRENCY_TX_CONFLICT` | Concurrent modification | Retry loop exhausted, return error |
| `ITEM_TX_CONFLICT` | Concurrent inventory change | Retry loop exhausted, return error |
| Invalid currency ID | Currency not in registry | Transaction rejected before DB write |
| Insufficient funds | `canApply()` returns false | ErrResult with descriptive message |
| DB read/write errors | Mongo connectivity | Logged, returns ErrResult |

**Result Pattern:**
- All async operations return `Result<T, Error>` (from `src/utils/result.ts`)
- `Ok<T>` and `Err<E>` classes with `isOk()`, `isErr()`, `unwrap()`, `unwrapOr()`
- No exceptions thrown in hot paths

---

## 2. Integration Plan

### 2.1 Goals

1. **Lazy account initialization** on first interaction
2. **Account status gating** (ok/blocked/banned) - initially for audit, later for enforcement
3. **Read-only commands:**
   - `balance`/`wallet` - Already exists, needs refactor
   - `bank` breakdown - Hand/bank split visualization
   - `inventory` - Already exists, needs alignment
   - `profile` summary - New composite view

### 2.2 Architecture Principles

- **Composition over inheritance:** Small focused modules with explicit interfaces
- **No `any` types:** Strict typing throughout
- **Backward compatibility:** Existing data shapes preserved
- **Atomic operations:** Continue using CAS pattern for mutations
- **Audit readiness:** Account status logged even if not enforced in Phase 1

### 2.3 Module Map

```
src/modules/economy/
├── index.ts                    # Public exports (existing)
├── currency.ts                 # Currency types (existing)
├── currencyRegistry.ts         # Currency registry (existing)
├── transactions.ts             # Currency TX engine (existing)
├── account/                    # NEW: Account domain
│   ├── types.ts                # EconomyAccount, AccountStatus
│   ├── repository.ts           # EconomyAccountRepo (lazy init, status)
│   └── service.ts              # EconomyAccountService (read-only ops)
├── currencies/                 # Currency implementations (existing)
│   ├── coin.ts
│   └── reputation.ts
└── views/                      # NEW: Read-only presenters
    ├── balance.ts              # Balance/wallet view builder
    ├── bank.ts                 # Bank breakdown view
    └── profile.ts              # Profile summary aggregator

src/db/schemas/
├── user.ts                     # EXTEND: Add economyAccount field
└── economy-account.ts          # NEW: EconomyAccountSchema

src/commands/economy/
├── balance.ts                  # REFACTOR: Use new view builder
├── deposit.ts                  # No change (mutating)
├── withdraw.ts                 # No change (mutating)
├── bank.ts                     # NEW: Bank breakdown command
├── profile.ts                  # NEW: Profile summary command
├── shared.ts                   # REFACTOR: Migrate helpers
└── shop.ts                     # Future: Shop integration

src/commands/game/
├── inventory.ts                # REFACTOR: Use new view patterns
└── ...
```

### 2.4 Domain Types and Interfaces

```typescript
// src/modules/economy/account/types.ts

export type AccountStatus = 'ok' | 'blocked' | 'banned';

export interface EconomyAccount {
  readonly userId: string;
  readonly status: AccountStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastActivityAt: Date;
  readonly version: number;  // For optimistic concurrency
}

// View types (read-only)
export interface BalanceView {
  readonly currencies: CurrencyBalanceView[];
  readonly totalValue: string;  // Human-readable aggregate
}

export interface CurrencyBalanceView {
  readonly id: string;
  readonly name: string;
  readonly display: string;
  readonly raw: unknown;
}

export interface BankBreakdownView {
  readonly hand: number;
  readonly bank: number;
  readonly total: number;
  readonly percentInBank: number;
}

export interface InventorySummaryView {
  readonly totalItems: number;
  readonly uniqueItems: number;
  readonly topItems: { name: string; quantity: number }[];
}

export interface ProfileSummaryView {
  readonly account: EconomyAccount;
  readonly balances: BalanceView;
  readonly inventory: InventorySummaryView;
  readonly reputation: number;
}

// Service interfaces
export interface EconomyAccountService {
  getAccount(userId: string): Promise<Result<EconomyAccount, Error>>;
  getBalanceView(userId: string): Promise<Result<BalanceView, Error>>;
  getBankBreakdown(userId: string): Promise<Result<BankBreakdownView, Error>>;
  getInventorySummary(userId: string): Promise<Result<InventorySummaryView, Error>>;
  getProfileSummary(userId: string): Promise<Result<ProfileSummaryView, Error>>;
  ensureAccount(userId: string): Promise<Result<EconomyAccount, Error>>;
}

// Repository interface
export interface EconomyAccountRepo {
  findById(userId: string): Promise<Result<EconomyAccount | null, Error>>;
  ensure(userId: string): Promise<Result<EconomyAccount, Error>>;
  updateStatus(userId: string, status: AccountStatus, expectedVersion: number): Promise<Result<EconomyAccount | null, Error>>;
  touchActivity(userId: string): Promise<Result<void, Error>>;
}
```

### 2.5 New vs Existing Module Mapping

| New Component | Wraps/Uses | Notes |
|--------------|------------|-------|
| `EconomyAccountRepo` | `UserStore` | Adds structured account metadata on top of existing user document |
| `EconomyAccountService` | `currencyRegistry`, `UserStore`, inventory helpers | Orchestrates reads across currency + inventory |
| `BalanceViewBuilder` | `buildBalanceFields` (existing) | Replaces inline field building with typed view |
| `BankBreakdownView` | `CoinValue` shape | New read-only calculator for hand/bank analysis |
| `ProfileSummaryView` | All above | Composite read-only aggregator |

### 2.6 Migration Strategy

**Phase 1 (Read-only, this plan):**
1. Add optional `economyAccount` subdocument to User schema
2. Lazy-init on first access (no migration script needed)
3. All existing data remains valid
4. New code handles missing `economyAccount` gracefully

**DB Schema Change (backward compatible):**
```typescript
// src/db/schemas/user.ts - EXTEND
export const UserSchema = z.object({
  // ... existing fields ...
  economyAccount: EconomyAccountSchema.optional().catch(() => undefined),
});

// src/db/schemas/economy-account.ts - NEW
export const EconomyAccountSchema = z.object({
  status: z.enum(['ok', 'blocked', 'banned']).catch('ok'),
  createdAt: z.date().catch(() => new Date()),
  updatedAt: z.date().catch(() => new Date()),
  lastActivityAt: z.date().catch(() => new Date()),
  version: z.number().int().nonnegative().catch(0),
});
```

**Backward Compatibility:**
- Old users without `economyAccount` field: Treated as `status: 'ok'`, lazily initialized on first access
- Commands continue working during rollout
- No breaking changes to existing currency/inventory data

---

## 3. Implementation Checklist

### 3.1 Foundation (Files to Add)

- [ ] `src/modules/economy/account/types.ts` - Domain types and interfaces
- [ ] `src/modules/economy/account/repository.ts` - `EconomyAccountRepo` implementation
- [ ] `src/modules/economy/account/service.ts` - `EconomyAccountService` implementation
- [ ] `src/modules/economy/account/index.ts` - Module exports
- [ ] `src/db/schemas/economy-account.ts` - Zod schema
- [ ] `src/modules/economy/views/balance.ts` - `BalanceViewBuilder`
- [ ] `src/modules/economy/views/bank.ts` - `BankBreakdownView` calculator
- [ ] `src/modules/economy/views/profile.ts` - `ProfileSummaryView` aggregator
- [ ] `src/modules/economy/views/index.ts` - Views module exports

### 3.2 Schema Updates (Files to Modify)

- [ ] `src/db/schemas/user.ts` - Add optional `economyAccount` field
- [ ] `src/modules/economy/index.ts` - Export new account modules

### 3.3 Command Refactors (Files to Modify)

- [ ] `src/commands/economy/balance.ts` - Use `BalanceViewBuilder`
- [ ] `src/commands/economy/shared.ts` - Deprecate `buildBalanceFields`, add new helpers
- [ ] `src/commands/game/inventory.ts` - Use new view patterns

### 3.4 New Commands (Files to Add)

- [ ] `src/commands/economy/bank.ts` - Bank breakdown command
- [ ] `src/commands/economy/profile.ts` - Profile summary command

### 3.5 Testing (Files to Add)

- [ ] `tests/db-tests/economy-account.int.test.ts` - Repository integration tests
- [ ] `tests/db-tests/economy-service.int.test.ts` - Service layer tests

---

## 4. Detailed Implementation Notes

### 4.1 Repository Implementation Pattern

```typescript
// src/modules/economy/account/repository.ts
// Follows MongoStore patterns but specialized for account metadata

class EconomyAccountRepoImpl implements EconomyAccountRepo {
  async ensure(userId: string): Promise<Result<EconomyAccount, Error>> {
    // 1. UserStore.ensure(userId) - creates user if missing
    // 2. If no economyAccount field, initialize with defaults
    // 3. Return structured account
    // Uses atomic transition if initializing for first time
  }
  
  async findById(userId: string): Promise<Result<EconomyAccount | null, Error>> {
    // 1. UserStore.get(userId)
    // 2. If exists but no economyAccount, return null (not yet initialized)
    // 3. If exists with economyAccount, parse and return
  }
}
```

### 4.2 Service Implementation Pattern

```typescript
// src/modules/economy/account/service.ts
// Composes UserStore, CurrencyRegistry, and inventory helpers

class EconomyAccountServiceImpl implements EconomyAccountService {
  constructor(
    private repo: EconomyAccountRepo,
    private registry: CurrencyRegistry,
  ) {}
  
  async getBalanceView(userId: string): Promise<Result<BalanceView, Error>> {
    // 1. Ensure account exists (lazy init)
    // 2. Load user currency inventory
    // 3. For each registered currency, build CurrencyBalanceView
    // 4. Return aggregate view
  }
}
```

### 4.3 View Builder Pattern

```typescript
// src/modules/economy/views/balance.ts
// Pure functions, no side effects, easily testable

export function buildBalanceView(
  inventory: CurrencyInventory,
  registry: CurrencyRegistry,
): BalanceView {
  // Iterate registry, format each currency
  // Handle missing entries with currency.zero()
  // Return typed view for UI rendering
}
```

### 4.4 Command Implementation Pattern

```typescript
// src/commands/economy/bank.ts
// Clean, minimal command body

@Declare({ name: "bank", description: "Muestra desglose de tu banco" })
@BindDisabled(Features.Economy)
export default class BankCommand extends Command {
  async run(ctx: CommandContext) {
    const result = await economyAccountService.getBankBreakdown(ctx.author.id);
    if (result.isErr()) {
      await ctx.write({ content: "Error cargando datos bancarios." });
      return;
    }
    const view = result.unwrap();
    await ctx.write({ embeds: [renderBankEmbed(view)] });
  }
}
```

---

## 5. Future Considerations (Phase 2+)

### 5.1 Account Status Enforcement

When ready to enforce account status:
1. Add middleware/guard decorator: `@RequireAccountStatus('ok')`
2. Add to transaction engine: Check status before applying currency/item transactions
3. Admin commands: `account block`, `account unblock`

### 5.2 Audit Logging

Account status changes should be logged via `GuildLogger`:
```typescript
await logger.generalLog({
  title: "Estado de cuenta modificado",
  fields: [
    { name: "Usuario", value: userMention, inline: true },
    { name: "Estado anterior", value: oldStatus, inline: true },
    { name: "Estado nuevo", value: newStatus, inline: true },
  ],
});
```

### 5.3 Multi-Guild Considerations

Current design is user-scoped. If per-guild economy is needed:
- Change key from `userId` to `userId:guildId` or add `guildId` field
- Update repository methods to accept guild context
- Consider separate collections for guild-scoped accounts

---

## 6. Summary

This integration plan adds a lightweight "account" abstraction on top of the existing currency/inventory system without disrupting current functionality. The key design decisions:

1. **Lazy initialization** - No migration needed, accounts created on first access
2. **Composition** - New modules wrap existing repositories, no god-objects
3. **Strict typing** - All new code uses explicit types, no `any`
4. **Backward compatible** - Existing data and commands continue working
5. **Audit-ready** - Account status field added even if not enforced in Phase 1

The result is a foundation for Phase 2 (enforcement, admin controls) while delivering immediate value through improved read-only commands.
