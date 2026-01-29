# Economy System Changelog

## Phase 2a - Currency Mutation Pipeline

### New Features

#### Currency Mutation Service
- **`CurrencyMutationService.adjustCurrencyBalance()`** - Mod-only currency adjustment
  - Supports positive and negative deltas (debt allowed)
  - Atomic MongoDB `$inc` updates (no lost updates)
  - Comprehensive audit logging
  - Permission gating via Discord `ManageGuild`
  - Target account status validation

#### Audit Logging System
- **`economy_audit` collection** - Stores all economy mutations
  - Actor, target, guild, timestamp
  - Before/after balances
  - Operation type and source
  - Queryable for future `/audit` command

#### Updated Command
- **`/give-currency`** - Refactored to use new pipeline
  - Supports negative amounts (remove currency)
  - Shows before/after balance
  - Automatic audit logging
  - Error messages for blocked/banned targets

### Technical Implementation

#### Atomic Updates
```typescript
// Simple numeric currencies use MongoDB $inc
$inc: { [`currency.${currencyId}`]: delta }

// Complex currencies (hand/bank) use existing transaction system
```

#### Service Flow
1. Validate actor permissions (mod-only)
2. Validate currency exists in registry
3. Ensure target account exists (create if needed)
4. Gate on target status (blocked/banned = reject)
5. Get current balance
6. Perform atomic update ($inc or transaction)
7. Create audit log entry
8. Return result with before/after

### Phase 2b - User-to-User Transfer

#### New Features

**`/transfer` Command**
- User-to-user currency transfer
- Amount must be positive (no negative transfers)
- Validates sufficient funds
- Atomic decrement/increment across two users
- Correlation ID links both sides in audit log

**Transfer Service Method**
- `CurrencyMutationService.transferCurrency()`
- Checks both sender and recipient account status
- Prevents self-transfer
- Creates two audit entries with shared correlation ID
- Best-effort refund on partial failure

### Files Added/Modified

```
src/modules/economy/
├── mutations/
│   ├── types.ts        # TransferCurrencyInput/Result
│   ├── service.ts      # transferCurrency() method
│   ├── validation.ts   # currencyId sanitization (security)
│   └── index.ts
├── audit/
│   ├── repository.ts   # ensureAuditIndexes()
│   └── ...
├── permissions.ts      # Centralized permission checker (NEW)
└── ...

src/commands/economy/
├── give-currency.ts    # Updated with sanitization
├── transfer.ts         # NEW command
└── ...

src/events/listeners/
└── economyInit.ts      # NEW - initializes audit indexes

tests/db-tests/
├── currency-mutation.int.test.ts
└── currency-transfer.int.test.ts   # NEW
```

---

## Critical Data Safety Fixes (Post-Review)

### Schema Fixes
- **Date Coercion**: Changed from `z.date()` to `z.coerce.date()` to handle ISO strings from DB
- **No Erasure on Parse Failure**: UserSchema now repairs corrupted `economyAccount` instead of setting to `undefined`
  - Prevents blocked/banned users from slipping past gating by appearing "accountless"

### Repository Fixes
- **Ensure Idempotency**: Race conditions in `ensure()` now return existing account instead of error
- **Pure findById()**: Removed auto-repair from `findById()`; repairs only happen in `ensure()` or `repair()`

### Service Fixes
- **Consistent Ensure+Gate**: Every public method now follows:
  1. `repo.ensure()` - creates/repairs account
  2. Gate on `account.status` - blocks if not "ok"
  3. Load data and build view
  4. Touch activity

### New Critical Tests
- Date coercion: ISO strings preserved as dates
- No erase: Invalid subdoc repaired not deleted
- Ensure race: Parallel ensures both succeed
- Gating: All views blocked for blocked/banned accounts
- Gating: Blocked even with malformed data
- Pure read: `findById()` does not repair

---

## Phase 3 (Current) - Read-Only UX & Safety

### New Features

#### Commands
- **`/bank`** - New command showing bank breakdown with safety rating
  - Displays hand/bank distribution
  - Calculates safety percentage
  - Provides actionable advice based on bank ratio

- **`/profile`** - New comprehensive profile command
  - Account status and metadata
  - Balance summary (collapsed view)
  - Inventory summary
  - Reputation display

#### Enhanced Commands
- **`/balance`** - Refactored with new UX
  - Shows "and X more" for multiple currencies
  - Graceful handling of blocked/banned accounts
  - Account creation notice on first use
  - No noisy spam - clean, focused output

- **`/inventory`** - Enhanced with filtering and sorting
  - Search by name (`buscar` option)
  - Direct page navigation (`pagina` option)
  - Better empty state messaging
  - Access control integration

### Technical Improvements

#### Pagination & Filtering
- **Inventory Pagination**: Configurable page size (default 6, max 25)
  - Sort by name, quantity, or ID
  - Ascending/descending order
  - Case-insensitive search across name, ID, and description
  - Boundary clamping (out-of-bounds requests handled gracefully)

- **Currency Collapse**: Smart display for multiple currencies
  - Shows top N currencies (default 4)
  - "And X more" indicator for hidden currencies
  - Primary currency highlighting

#### Safety Edges
1. **Account Status Gating**
   - `ok` - Full access
   - `blocked` - Denied with generic message
   - `banned` - Denied with generic message
   - No moderation details leaked in error messages

2. **Data Corruption Repair**
   - Automatic detection of invalid fields
   - Auto-repair on read with logging
   - Explicit repair endpoint for admin use
   - Version increment on repair for audit trail

3. **Rate-Limit Friendly Design**
   - Parallel data fetching where possible
   - Fire-and-forget activity touches
   - No redundant DB reads

4. **Graceful Degradation**
   - Missing user records handled
   - Corrupted data auto-repaired
   - Empty states with helpful CTAs
   - Consistent error messages without internal details

#### Formatting Utilities
Centralized formatting in `src/modules/economy/account/formatting.ts`:
- `buildBalanceEmbed()` - Consistent balance display
- `buildBankEmbed()` - Bank breakdown with progress bars
- `buildInventoryPageEmbed()` - Paginated inventory view
- `buildProfileEmbed()` - Composite profile view
- `buildAccessDeniedEmbed()` - Generic restriction message
- `buildAccountCreatedEmbed()` - Welcome message for new users
- `buildErrorEmbed()` - Safe error display with optional log ref

### Architecture

```
src/modules/economy/
├── account/
│   ├── types.ts          # Domain types and constants
│   ├── repository.ts     # Lazy init, status management, repair
│   ├── service.ts        # Orchestration with access control
│   ├── formatting.ts     # Embed/message builders
│   └── index.ts          # Module exports
├── views/
│   ├── balance.ts        # Balance view builder
│   ├── bank.ts           # Bank breakdown calculator
│   ├── inventory.ts      # Pagination and filtering
│   ├── profile.ts        # Composite view aggregator
│   └── index.ts          # View exports
└── index.ts              # Main exports

src/commands/economy/
├── balance.ts            # Refactored
├── bank.ts               # New
├── profile.ts            # New
└── shared.ts             # Deprecated helpers marked

src/commands/game/
└── inventory.ts          # Refactored with search/sort

tests/db-tests/
└── economy-account.int.test.ts  # Integration tests
```

### Database Changes
Added optional `economyAccount` subdocument to User schema:
```typescript
economyAccount: {
  status: "ok" | "blocked" | "banned",
  createdAt: Date,
  updatedAt: Date,
  lastActivityAt: Date,
  version: number  // For optimistic concurrency
}
```

**Backward Compatible**: Existing users work without migration; accounts created lazily on first access.

---

## Phase 2 (Foundation) - Core Account Structure

*Phase 2 was implemented as part of Phase 3 delivery (combined implementation).*

### Features
- Lazy account initialization on first interaction
- Account status tracking (ok/blocked/banned)
- Optimistic concurrency with versioning
- Read-only view architecture

---

## Phase 1 (Historical) - Basic Economy

*Pre-existing implementation.*

### Features
- Currency system with registry pattern
- Hand/bank coin currency
- Simple reputation counter
- Item inventory with transactions
- Optimistic concurrency for mutations

---

## Future Considerations

### Phase 4 Ideas
1. **Transaction History** - Audit log for all economy changes
2. **Daily Rewards** - `/daily` command with streak tracking
3. **Leaderboards** - Top balances, reputation, inventory value
4. **Transfer Limits** - Rate limiting for currency transfers
5. **Shop Integration** - Buy/sell items with economy account
6. **Guild-wide Settings** - Per-guild economy configuration

### Migration Path
All changes maintain backward compatibility:
- Existing data remains valid
- New fields are optional with defaults
- Lazy initialization requires no migration scripts
- Version increments allow audit trail reconstruction
