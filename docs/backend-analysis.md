# Backend Module Analysis

Generated from Phase 2 of the command audit. Covers modules referenced by audited commands.

---

## 1. Economy Account Service (`modules/economy/account/service.ts`)

**Size**: ~388 lines
**API**: `ensureAccount`, `getAccount`, `getBalanceView`, `getBankBreakdown`, `getInventorySummary`, `getInventoryPage`, `getProfileSummary`, `checkAccess`, `repairAccount`

### Issues Found

**A. Deprecated factory still in use**
- Line 385: `createEconomyAccountService(repo)` is marked "Deprecated: use economyAccountService singleton directly"
- But **12+ commands** still call `createEconomyAccountService(economyAccountRepo)` — creating throwaway instances identical to the singleton
- Files affected: `balance.subcommand.ts`, `bank.subcommand.ts`, `perks.ts`, `trinkets.ts`, `trinkets-unequip.ts`, `loadout.ts`, `coinflip.subcommand.ts`, `inventory.ts`, etc.
- **Fix**: Replace all `createEconomyAccountService(economyAccountRepo)` with `economyAccountService` import. Remove factory function.

**B. Repeated ensure→gate→UserStore.get pattern**
- Every method (`getBalanceView`, `getBankBreakdown`, `getInventorySummary`, `getInventoryPage`, `getProfileSummary`) follows the exact same 4-step pattern:
  1. `this.repo.ensure(userId)`
  2. `checkGate(account.status)`
  3. `UserStore.get(userId)`
  4. Build view + `touchActivity`
- This is ~20 lines of boilerplate repeated 5x.
- **Fix**: Extract a private `loadUserWithGate(userId)` helper that returns `Result<{ account, user }, Error>`.

**C. Two data sources for same user**
- `economyAccountRepo.ensure()` returns the economy account doc
- `UserStore.get()` returns the full user doc (separate collection or same?)
- Every method calls BOTH — suggesting account data is split across two docs/collections
- Not necessarily a bug, but worth understanding if this is intentional or legacy

---

## 2. Currency Mutation Service (`modules/economy/mutations/service.ts`)

**Size**: 782 lines — **largest service file**
**API**: `adjustCurrencyBalance`, `transferCurrency`

### Issues Found

**A. Dead code: `computeTaxAndNet`**
- Line 148: `function computeTaxAndNet(amount) { return { tax: 0, netAmount: amount }; }`
- Always returns zero tax. Called in `executeTransferTransaction` but the tax field is never used.
- **Fix**: Remove dead function. Use `amount` directly.

**B. Spanish error messages**
- Line 133: `"No puedes transferirte a ti mismo."` (self-transfer error)
- Line 306: `"Error en la transferencia. Intenta nuevamente."` (DB error in transfer)
- Line 323: `"Error de base de datos durante la transferencia."` (DB error)
- Line 612: `"Error de base de datos."` (DB error in adjust)
- **Fix**: Replace all with English equivalents.

**C. Duplicated audit creation**
- `adjustCurrencyBalance` has two separate code paths that both create audit entries:
  - Lines 664-677: For complex currencies (inside the `currencyTransaction` branch)
  - Lines 722-735: For simple currencies and rep (after the main flow)
- Both create `"currency_adjust"` entries with identical structure
- **Fix**: Unify into a single audit call after the branching.

**D. `as any` casts on MongoDB operations**
- Lines 273, 275, 276, 277, 292, 293, 294, 592, 593 etc. — pervasive `as any` on MongoDB filter/update objects
- Root cause: TypeScript doesn't know the User schema has dynamic `currency.*` fields
- **Fix**: Create a typed helper for currency field updates, or use a MongoDB utility type.

**E. Dynamic import of `currencyTransaction`**
- Line 619: `const { currencyTransaction } = await import("../transactions");`
- Line 328: Same dynamic import in `executeTransferTransaction`
- Likely done to avoid circular dependency. But it's a code smell.
- **Fix**: Consider restructuring to avoid circular dependency, or at minimum document why.

**F. Rep special-casing in adjustCurrencyBalance**
- Lines 559-579: Special handling for `currencyId === "rep"` using `incrementReputation`
- But the command (`give-currency.ts`) ALSO does rep-specific logic (autorole sync, tops recording)
- This means rep handling is split between service and command — fragile.
- **Fix**: Move ALL rep side-effects into the service.

---

## 3. Currency Transaction Engine (`modules/economy/transactions.ts`)

**Size**: 157 lines
**API**: `currencyTransaction(userId, tx)`, `currencyEngine`

### Assessment
- **Well-designed**: Uses optimistic concurrency with CAS (compare-and-swap) via `runUserTransition`
- **Clean separation**: Engine applies changes, persistence is separate
- **Issue**: Used directly by `/wallet deposit` and `/wallet withdraw` commands, bypassing the account service layer and its status gates. These commands should go through a service method instead.
- **Fix**: Add `deposit()` and `withdraw()` methods to `EconomyAccountService` that internally use `currencyTransaction` after proper gating.

---

## 4. Item Mutation Service (`modules/economy/mutations/items/service.ts`)

**Size**: 331 lines
**API**: `adjustItemQuantity(input, checkAdmin)`

### Issues Found

**A. Spanish error message**
- Line 223: `"No se pueden remover más items de los que posee"` — should be English
- **Fix**: Replace with English.

**B. Double `perkService.getCapacityLimits` call**
- Lines 197-204: Called before update to check capacity
- Lines 272-280: Called AGAIN after update to report capacity in result
- **Fix**: Cache the limits from the first call and reuse.

**C. Direct MongoDB operations**
- Lines 232-255: Uses `UserStore.collection()` directly with `$set/$unset` — bypasses the optimistic concurrency system used by `currencyTransaction`
- Not necessarily wrong for items (which are set/unset rather than incremented), but inconsistent.

---

## 5. Economy Index / Barrel Export (`modules/economy/index.ts`)

**Size**: 230 lines of exports
**Exports from**: ~15 submodules via star exports and named exports

### Issues Found

**A. Massive re-export surface**
- Star exports from `./account`, `./views`, `./progression`, `./perks`, `./equipment`, `./crafting`, `./minigames`, `./voting`
- Named exports from `./guild`, `./daily`, `./work`, `./store`, `./mutations`, `./audit`, `./rollback`, `./permissions`
- Makes it hard to know where something actually lives

**B. Star exports create implicit API surface**
- `export * from "./minigames"` — any new export from minigames automatically becomes part of the economy public API
- Can lead to unintended coupling

**C. Mixed export styles**
- Some submodules use star exports, others use carefully named exports
- **Recommendation**: Prefer named exports for everything to make the public API explicit.

---

## 6. Permissions Module (`modules/economy/permissions.ts`)

### Issues Found

**A. Dynamic imports in commands**
- 6+ commands use `await import("@/modules/economy/permissions")` instead of static imports
- Files: `economy-health.ts`, `economy-rollback.ts`, `event.ts` (2x), `quest.ts` (2x)
- No circular dependency justification found — likely just copy-paste
- **Fix**: Convert to static imports.

---

## 7. Currency Registry (`modules/economy/currencyRegistry.ts`)

### Issues Found

**A. `display()` type mismatch**
- Commands call `currencyObj.display(amount)` but the type signature expects a different type (not a plain number)
- This causes `as any` casts in ~15 commands: `currencyObj?.display(n as any)`
- **Root cause**: The currency `display` function is typed for the currency's internal value type (e.g., `{ hand: number, bank: number }` for coins), but commands often want to display a plain number
- **Fix**: Add a `displayAmount(n: number): string` method to the registry or currency definition that handles plain numbers. Or overload `display()` to accept numbers.

---

## 8. Moderation Service (`modules/moderation/service.ts`)

### Issues Found

**A. Inconsistent logging across mod commands**
- `/ban`, `/kick`, `/mute` use `GuildLogger.banSanctionLog()`
- `/warn add` uses `logModerationAction()` from `@/utils/moderationLogger`
- `/restrict` uses `GuildLogger.banSanctionLog()` but doesn't call `registerCase()`
- Three different patterns for logging the same type of action
- **Fix**: Standardize on a single moderation logging pipeline. Preferably `registerCase()` + a single log function.

---

## 9. Guild Economy Service (`modules/economy/guild/`)

### Assessment
- Provides config management for per-guild economy settings
- Well-structured with clear service/repo separation
- Used by many commands for feature flags and config

### Issue
- Feature flag checking is done manually in every command instead of being handled by a decorator or middleware
- **Fix**: Consider extending the `@BindDisabled(Features.Economy)` pattern to check specific sub-features (e.g., `@BindDisabled(Features.Rob)`)

---

## Cross-Cutting Backend Issues Summary

### Priority 1 (High Impact, Low Risk)
1. **Remove `createEconomyAccountService` factory** — replace 12+ callsites with singleton import
2. **Fix Spanish error messages** — 6+ instances across mutation services
3. **Convert dynamic imports to static** — 6+ files importing permissions dynamically
4. **Fix `display()` type** — add `displayAmount(n: number)` to eliminate ~15 `as any` casts

### Priority 2 (Medium Impact)
5. **Extract `loadUserWithGate` helper** in EconomyAccountService — eliminates ~100 lines of boilerplate
6. **Move rep side-effects** from `give-currency` command into `CurrencyMutationService`
7. **Unify audit creation** in `adjustCurrencyBalance` — remove duplication
8. **Add `deposit()`/`withdraw()` to EconomyAccountService** — stop deposit/withdraw from bypassing service layer
9. **Standardize moderation logging** — single pipeline for all mod commands

### Priority 3 (Low Impact, Cleanup)
10. **Remove dead `computeTaxAndNet`** function
11. **Cache `perkService.getCapacityLimits`** in item mutation service
12. **Consider named exports** instead of star exports in economy index
13. **Remove economy config 20-file pattern** — consolidate set-* commands

### Dead Code Identified
- `computeTaxAndNet()` in mutations/service.ts — always returns {tax: 0}
- `createEconomyAccountService()` — deprecated but widely used
- `buildBalanceFields()` in commands/economy/shared.ts — marked deprecated
- Some formatting functions in shared.ts noted as moved to account/formatting but file kept for "backward compatibility"
