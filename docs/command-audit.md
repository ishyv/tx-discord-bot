# Command Audit Database

Generated: 2026-02-18. Systematic audit of every command in the codebase.

**Legend — Verdict:**
- `OK` — Works as intended, no changes needed
- `fix` — Has specific bugs or issues to address
- `merge` — Candidate for merging with another command or shared logic
- `rework` — Needs significant restructuring
- `simplify` — Works but is bloated / over-engineered

---

## 1. Economy Core

### `/wallet balance`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/wallet/balance.subcommand.ts` |
| **Inputs** | None |
| **Purpose** | Show user coin/rep balances |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `buildBalanceEmbed`, `buildAccessDeniedEmbed`, `buildAccountCreatedEmbed`, `EconomyError` |
| **Issues** | None found. Clean delegation to service layer. |
| **Verdict** | `OK` |

### `/wallet bank`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/wallet/bank.subcommand.ts` |
| **Inputs** | None |
| **Purpose** | Show hand/bank distribution with safety rating |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `buildBankEmbed`, `getBankSafetyRating`, `EconomyError` |
| **Issues** | **Redundant access check**: Calls both `checkAccess()` AND handles `ACCOUNT_BLOCKED/BANNED` from `getBankBreakdown()`. Double-checking. Also casts `access.status as any`. |
| **Verdict** | `fix` — Remove redundant access check; the service should handle it. Fix `as any` cast. |

### `/wallet daily`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/wallet/daily.subcommand.ts` |
| **Inputs** | None |
| **Purpose** | Claim daily reward with streak |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `dailyService`, `currencyRegistry`, `buildDailyClaimEmbed` |
| **Issues** | **Redundant account check**: Creates a new `accountService` instance at module level, then creates ANOTHER inline. Missing `@BindDisabled` and `@Cooldown` decorators (unlike sibling commands). No feature flag check. |
| **Verdict** | `fix` — Add missing decorators. Use single service instance pattern. |

### `/wallet deposit`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/wallet/deposit.subcommand.ts` |
| **Inputs** | `amount: string` (supports "all", "%") |
| **Purpose** | Move coins from hand to bank |
| **Backend deps** | `UserStore`, `currencyTransaction`, `parseAmountOrReply`, `replyMissingUser` |
| **Issues** | **Different data access pattern**: Uses `UserStore.ensure()` directly instead of `createEconomyAccountService`. No account status check (blocked/banned users can deposit). Uses raw `currencyTransaction` instead of mutation service. Hardcoded to "coins" currency. |
| **Verdict** | `rework` — Should use economy account service like sibling commands. Add account status check. |

### `/wallet withdraw`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/wallet/withdraw.subcommand.ts` |
| **Inputs** | `amount: string` (supports "all", "%") |
| **Purpose** | Move coins from bank to hand |
| **Backend deps** | `UserStore`, `currencyTransaction`, `parseAmountOrReply`, `normalizeInt` |
| **Issues** | **Same issues as deposit**: Uses `UserStore` directly, no account status check, raw `currencyTransaction`, hardcoded "coins". |
| **Verdict** | `rework` — Same fix needed as deposit. |

### `/transfer`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/transfer.ts` |
| **Inputs** | `currency: string (choice)`, `amount: int (min 1)`, `recipient: user`, `reason?: string` |
| **Purpose** | User-to-user currency transfer with tax |
| **Backend deps** | `currencyRegistry`, `currencyMutationService`, `sanitizeCurrencyId`, `guildEconomyService`, `getGuildChannels` |
| **Issues** | `console.log` left in for large transfer alerts (line 122). `as any` casts on `currencyObj.display()` calls (lines 193, 198, 199). |
| **Verdict** | `fix` — Remove console.log, fix `as any` casts. |

### `/work`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/work.ts` |
| **Inputs** | None |
| **Purpose** | Repeatable work payout with cooldown + daily cap |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `workService`, `guildEconomyService`, `currencyRegistry` |
| **Issues** | **Redundant account check**: Creates service, ensures account, checks status, THEN calls `workService` which likely does its own checks. Wraps entire handler in try/catch that catches generic errors — service should handle this. `as any` cast on display. |
| **Verdict** | `simplify` — Remove redundant pre-checks if service handles them. Remove outer try/catch. |

### `/rob`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/rob.ts` |
| **Inputs** | `target: user` |
| **Purpose** | Attempt to steal currency from another user |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `guildEconomyRepo`, `minigameRepo`, `minigameService`, `currencyRegistry` |
| **Issues** | **Three redundant checks before service call**: (1) feature flag via `guildEconomyRepo`, (2) null target check (Seyfert already validates required options), (3) account ensure + status. The service (`minigameService.rob`) handles all these cases and returns typed errors. Also shows a warning embed BEFORE executing — so user sees TWO messages. Uses `currencyRegistry.get("coin")` but might be configurable. |
| **Verdict** | `rework` — Remove all pre-checks, let service handle them. Fix double-message issue (warning then result). |

### `/give-currency`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/give-currency.ts` |
| **Inputs** | `currency: string (choice)`, `amount: int`, `target: user`, `reason?: string` |
| **Purpose** | Mod-only currency adjustment |
| **Backend deps** | `currencyRegistry`, `currencyMutationService`, `createEconomyPermissionChecker`, `sanitizeCurrencyId`, `AutoroleService`, `recordReputationChange` |
| **Issues** | **Reputation side-effect in command**: Lines 130-143 handle rep-specific logic (autorole sync, tops recording) directly in the command instead of in the service. `as any` casts on display. |
| **Verdict** | `fix` — Move rep side-effects into `currencyMutationService`. Fix `as any`. |

### `/remove-currency`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/remove-currency.ts` |
| **Inputs** | `currency: string (choice)`, `amount: int (min 1)`, `target: user`, `reason?: string` |
| **Purpose** | Mod-only currency removal (allows debt) |
| **Backend deps** | `currencyTransaction`, `currencyRegistry`, `GuildLogger`, `adjustUserReputation`, `AutoroleService`, `recordReputationChange` |
| **Issues** | **Completely different pattern from give-currency**: Uses raw `currencyTransaction` instead of `currencyMutationService`. Has confusing `buildCostValue` with uncertain comments ("verify what `use_total_on_subtract` does"). Rep handling is duplicated but different from give-currency. No `sanitizeCurrencyId`. Creates `new GuildLogger()` manually instead of using service pattern. Multiple `as any` casts. No permission check via `createEconomyPermissionChecker`. |
| **Verdict** | `rework` — Should mirror give-currency using `currencyMutationService.adjustCurrencyBalance` with negative delta. Remove all duplicated logic. |

### `/profile` (economy)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/profile.ts` |
| **Inputs** | None |
| **Purpose** | Comprehensive economy profile display |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `buildProfileEmbed`, `achievementService`, `votingService`, `votingRepo` |
| **Issues** | **Spanish error message** "No pude cargar tu perfil." (lines 56, 93) — inconsistent language. **Heavy command**: Makes 5+ service calls (ensureAccount, getProfileSummary, getAchievementBoard, getEquippedTitle, getEquippedBadges, voting stats). Could be a single `getFullProfile()` service method. |
| **Verdict** | `fix` — Fix language. Consider consolidating service calls into a single backend method. |

### `/progress`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/progress.ts` |
| **Inputs** | None |
| **Purpose** | Show XP and level progression |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `progressionService`, `dailyClaimRepo`, `buildProgressEmbed` |
| **Issues** | Clean. Minor: redundant account ensure since progression service could handle it. |
| **Verdict** | `OK` |

---

## 2. Economy Features

### `/store` (+ store-buy, store-sell, store-list, store-featured)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/store.ts` (565 lines) |
| **Inputs** | buy: `item: string, quantity?: int`; sell: `item: string, quantity?: int` |
| **Purpose** | Guild store buy/sell with featured rotation |
| **Backend deps** | `storeService`, `guildEconomyService`, `progressionService`, `guildEconomyRepo`, `storeRotationService`, `currencyRegistry`, `ITEM_DEFINITIONS` |
| **Issues** | **Bloated file**: 4 command classes + 1 helper function in single file (565 lines). **Feature flag check duplicated** in buy, sell, list, and featured (4x same code). **XP granting in command** instead of in service (lines 164-185, 287-308). `currencyRegistry.get(purchase.guildId)` on line 159 looks like a bug — passing guildId instead of currencyId. |
| **Verdict** | `rework` — Split into subcommands. Move feature flag + XP logic to service. Fix currency lookup bug. |

### `/market`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/market.ts` (704 lines) |
| **Inputs** | None (interactive UI) |
| **Purpose** | Interactive player marketplace |
| **Backend deps** | `marketService`, `getItemDefinition`, market views/types, UI framework |
| **Issues** | **Largest command file** at 704 lines. Complex but well-structured interactive UI. Many helper functions that could move to a view layer. |
| **Verdict** | `simplify` — Extract helper functions to market views module. |

### `/trivia`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/trivia.ts` (331 lines) |
| **Inputs** | `category?: string (choice)` |
| **Purpose** | Answer trivia questions for rewards |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `guildEconomyRepo`, `minigameService`, `DIFFICULTY_CONFIG` |
| **Issues** | **Redundant pre-checks** (feature flag, account ensure, account status — service handles all). **Duplicate button creation** in `showQuestion` and `showExistingQuestion` (lines 222-256 and 294-322 are nearly identical). Dynamic import on line 264. |
| **Verdict** | `simplify` — Remove redundant checks. Extract shared button builder. |

### `/trivia-admin`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/trivia-admin.ts` |
| **Inputs** | Various trivia config options |
| **Purpose** | Configure trivia settings |
| **Verdict** | `OK` (not read in detail — admin config pattern) |

### `/vote`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/vote.ts` (252 lines) |
| **Inputs** | `user: user`, `type: string (love/hate)` |
| **Purpose** | Cast love/hate votes |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `guildEconomyRepo`, `votingService` |
| **Issues** | **Triple redundant pre-check**: feature flag, account ensure, account status, canVote — then castVote which re-validates everything. `canVote` result check uses string matching on reason text (line 136 `reasonLower.includes("cooldown")`) — fragile. |
| **Verdict** | `simplify` — Remove pre-checks, use error codes from castVote instead of string matching from canVote. |

### `/vote-config`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/vote-config.ts` |
| **Purpose** | Configure voting settings |
| **Verdict** | `OK` (admin config pattern) |

### `/vote-leaderboard`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/vote-leaderboard.ts` |
| **Purpose** | Show vote leaderboard |
| **Verdict** | `OK` |

### `/gamble coinflip`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/gamble/coinflip.subcommand.ts` (220 lines) |
| **Inputs** | `amount: int (min 1)`, `choice: string (heads/tails)` |
| **Purpose** | Bet on coin flip |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `guildEconomyRepo`, `minigameRepo`, `minigameService`, `currencyRegistry` |
| **Issues** | **Same redundant pre-check pattern** as rob/trivia/vote: feature flag, account ensure, status check, config validation — all repeated before service call. `amount < 1` check on line 93 is redundant (Discord enforces `min_value: 1`). |
| **Verdict** | `simplify` — Remove redundant checks. |

### `/perks` (list, buy)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/perks.ts` (387 lines) |
| **Inputs** | buy: `perk: string` |
| **Purpose** | View and purchase perks |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `perkService`, `getPerkDefinition`, `currencyRegistry` |
| **Issues** | **Redundant account check** in list. `showConfirmation` helper extracts well but `balanceBefore/balanceAfter` hardcoded to 0 on line 349-350. Effects display duplicated between list and confirmation (lines 137-156 and 294-302). |
| **Verdict** | `fix` — Fix hardcoded 0 balance. Extract shared effects formatter. |

### `/event` (+ event-start, event-stop)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/event.ts` (412 lines) |
| **Inputs** | start: `name, description?, duration?, xp_multiplier?, daily_bonus?, work_bonus?, trivia_bonus?, store_discount?, quest_bonus?, crafting_reduction?` |
| **Purpose** | Guild events with modifiers |
| **Backend deps** | `eventService`, `economyAuditRepo`, `checkEconomyPermission` |
| **Issues** | **Audit logging in command** (lines 193-208, 299-312) instead of in service. Dynamic import of `EconomyPermissionLevel` (lines 129, 262) instead of static. |
| **Verdict** | `fix` — Move audit logging to service. Use static import. |

### `/quest` (+ board, view, claim, progress, list)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/quest.ts` (571 lines) |
| **Inputs** | `tab?: string`, view/claim: `id: string` |
| **Purpose** | Economy quest board and management |
| **Backend deps** | `questService`, `questRepo`, `questRotationService` |
| **Issues** | **Quest board and QuestBoardSubCommand are identical** (lines 58-112 and 121-174 — exact same code duplicated). **Rotation lookup duplicated** in view and claim (lines 209-227 and 314-332 — same 3 parallel queries + loop). `Embed` dynamically imported in progress subcommand (line 437). |
| **Verdict** | `rework` — Deduplicate board logic. Extract rotation finder. Use static import. |

### `/quests` (RPG quests UI)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/quests.ts` (275 lines) |
| **Inputs** | None (interactive UI) |
| **Purpose** | RPG quest board with accept/claim/abandon |
| **Backend deps** | `rpgQuestService`, quest UI builders |
| **Issues** | **Naming collision**: `/quest` is economy quests, `/quests` is RPG quests. Very confusing. Otherwise clean interactive UI. |
| **Verdict** | `fix` — Rename to clarify distinction (e.g., `/rpg quests`). |

### `/trinkets`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/trinkets.ts` (437 lines) |
| **Inputs** | `slot?: string (choice)` |
| **Purpose** | Manage equipment (trinkets, rings, necklaces) |
| **Backend deps** | `equipmentService`, `economyAccountRepo`, `createEconomyAccountService`, `getEquipableItemDefinition`, `RARITY_CONFIG` |
| **Issues** | **Stats formatting duplicated 3x** in `showSlotItems` (lines 236-261), `showEquipConfirmation` (lines 323-348), and `loadout.ts` (lines 94-119). Magic number `64` instead of `MessageFlags.Ephemeral` (lines 128, 186, 213, etc.). |
| **Verdict** | `simplify` — Extract shared stats formatter. Replace magic `64` with constant. |

### `/trinkets-unequip`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/trinkets-unequip.ts` (259 lines) |
| **Inputs** | `slot?: string (choice)` |
| **Purpose** | Remove equipped trinkets |
| **Backend deps** | Same as trinkets |
| **Issues** | **Duplicated `getRarityEmoji` helper** from trinkets.ts (lines 36-41). Same magic `64` issue. Could be merged with trinkets as a subcommand. |
| **Verdict** | `merge` — Merge into trinkets command as unequip flow. Share rarity helpers. |

### `/trinkets-loadout`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/loadout.ts` (165 lines) |
| **Inputs** | None |
| **Purpose** | View equipped trinkets with stats |
| **Backend deps** | `equipmentService`, `economyAccountRepo`, `createEconomyAccountService` |
| **Issues** | **Stats formatting duplicated** again (3rd copy). Inconsistent indentation (lines 101-116 nested extra). Could be part of trinkets. |
| **Verdict** | `merge` — Merge into trinkets command. Extract stats formatter. |

### `/title` (+ set, list, clear, badges)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/title.ts` (373 lines) |
| **Inputs** | set: `id: string`; badges: `slot?: number, badge?: string` |
| **Purpose** | Manage titles and badges |
| **Backend deps** | `achievementService`, title/badge embed builders |
| **Issues** | Clean. Well-structured subcommands. |
| **Verdict** | `OK` |

---

## 3. Economy Admin

### `/economy-freeze`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-freeze.ts` |
| **Inputs** | `user: user`, `reason: string`, `hours?: int` |
| **Purpose** | Freeze a user's economy account |
| **Backend deps** | `economyModerationService` |
| **Issues** | `ctx.options` cast `as` anonymous type (line 58) instead of using typed `Options`. |
| **Verdict** | `fix` — Use typed options decorator. |

### `/economy-unfreeze`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-unfreeze.ts` |
| **Inputs** | `user: user`, `reason?: string` |
| **Purpose** | Unfreeze a user's economy account |
| **Backend deps** | `economyModerationService` |
| **Issues** | Same `ctx.options as` pattern. |
| **Verdict** | `fix` — Use typed options. |

### `/economy-peek`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-peek.ts` |
| **Inputs** | `user: user` |
| **Purpose** | View user economy data for moderation |
| **Backend deps** | `economyModerationService`, `getRemainingFreezeHours` |
| **Issues** | **Convoluted freeze check** on line 70: calls `isFrozen` twice, chains `.then()` inside an `await`, casts `as any`. Same `ctx.options as` pattern. |
| **Verdict** | `fix` — Simplify freeze check. Use typed options. |

### `/economy-health`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-health.ts` |
| **Inputs** | None |
| **Purpose** | Show economy health summary |
| **Backend deps** | `checkEconomyPermission`, `guildEconomyService`, `economyAuditRepo` |
| **Issues** | Dynamic import of `EconomyPermissionLevel`. |
| **Verdict** | `fix` — Use static import. |

### `/economy-report`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-report.ts` |
| **Inputs** | `days?: int (1-30)` |
| **Purpose** | Generate economy telemetry report |
| **Backend deps** | `economyReportService` |
| **Issues** | Clean. Well-structured. References non-existent commands in knobs checklist (`/guild-economy`, `/shop restock`). |
| **Verdict** | `fix` — Update help text references. |

### `/economy-rollback`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-rollback.ts` |
| **Inputs** | `correlation_id: string`, `allow_mixed_guilds?: bool` |
| **Purpose** | Rollback audited operations |
| **Backend deps** | `checkEconomyPermission`, `rollbackByCorrelationId` |
| **Issues** | Dynamic import of `EconomyPermissionLevel`. |
| **Verdict** | `fix` — Use static import. |

### `/economy-audit recent`
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-audit/recent.command.ts` |
| **Purpose** | View recent audit entries |
| **Verdict** | `OK` (not read in detail) |

### Economy Config (20 set-* subcommands)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/economy-config/*.command.ts` (20 files) |
| **Purpose** | Individual config setters for economy parameters |
| **Issues** | **20 nearly identical files** that each set a single config value. Classic merge candidate. All follow same pattern: validate input → call service → show result. |
| **Verdict** | `merge` — Consider consolidating into fewer subcommands or a single config command with more options. |

### Store Admin (add, edit, remove)
| Field | Value |
|-------|-------|
| **File** | `src/commands/economy/store-admin/*.ts` |
| **Purpose** | Manage store items |
| **Verdict** | `OK` (not read in detail — standard CRUD admin) |

---

## 4. Moderation

### `/ban`
| Field | Value |
|-------|-------|
| **File** | `src/commands/moderation/ban.ts` |
| **Inputs** | `user: user`, `reason: string` |
| **Purpose** | Ban a user |
| **Backend deps** | `registerCase`, `isSnowflake`, `UIColors` |
| **Issues** | `ctx.guildId!` non-null assertion (line 99) after earlier null check. `reason` is required but sibling `kick` makes it optional — inconsistent. `GuildLogger.banSanctionLog` used for both ban AND kick logs. |
| **Verdict** | `fix` — Remove non-null assertion. Make reason handling consistent across mod commands. |

### `/kick`
| Field | Value |
|-------|-------|
| **File** | `src/commands/moderation/kick.ts` |
| **Inputs** | `user: user`, `reason?: string` |
| **Purpose** | Kick a user |
| **Backend deps** | `registerCase`, `isSnowflake`, `UIColors` |
| **Issues** | Same `ctx.guildId!` assertion. Uses `banSanctionLog` for kick (confusing method name). Missing `reason` default differs from ban. |
| **Verdict** | `fix` — Same fixes as ban. Rename log method or use generic `sanctionLog`. |

### `/mute`
| Field | Value |
|-------|-------|
| **File** | `src/commands/moderation/mute.ts` |
| **Inputs** | `user: user`, `time: string`, `reason?: string` |
| **Purpose** | Timeout a user |
| **Backend deps** | `registerCase`, `parse`/`isValid` from `@/utils/ms`, `isSnowflake` |
| **Issues** | Same `banSanctionLog` naming issue. Uses custom `@/utils/ms` parser — verify it handles edge cases. |
| **Verdict** | `fix` — Same log method naming. |

### `/restrict`
| Field | Value |
|-------|-------|
| **File** | `src/commands/moderation/restrict.ts` |
| **Inputs** | `user: user`, `type: string (forums/voice/jobs/all)`, `reason: string` |
| **Purpose** | Restrict user via roles |
| **Backend deps** | `RESTRICTED_*_ROLE_ID` constants, `isSnowflake` |
| **Issues** | **Hardcoded role IDs** from `@/constants/guild` — not configurable per server. No `registerCase` call (unlike ban/kick/mute). Uses `banSanctionLog` again. |
| **Verdict** | `fix` — Add case registration. Consider making role IDs configurable. |

### `/warn add`
| Field | Value |
|-------|-------|
| **File** | `src/commands/moderation/warn/add.command.ts` |
| **Inputs** | `user: user`, `reason?: string` |
| **Purpose** | Add a warning |
| **Backend deps** | `addWarn`, `listWarns`, `generateWarnId`, `registerCase`, `logModerationAction` |
| **Issues** | Uses `addWarn`/`listWarns` directly from repositories instead of a service. WarnId collision check loops (while loop, line 74). Uses `logModerationAction` while other mod commands use `GuildLogger.banSanctionLog` — **inconsistent logging**. |
| **Verdict** | `fix` — Use consistent logging pattern across all mod commands. |

### `/cases`
| Field | Value |
|-------|-------|
| **File** | `src/commands/moderation/cases.command.ts` |
| **Inputs** | `user?: user` |
| **Purpose** | View sanction history |
| **Backend deps** | `UserStore` |
| **Issues** | Accesses `UserStore` directly. No permission check — any user can view any user's cases. `ctx.guildId!` non-null assertion. |
| **Verdict** | `fix` — Add permission check for viewing others' cases. |

### Moderation subgroups (autorole, channels, forums, rep, roles, tickets, tops, warn)
| Field | Value |
|-------|-------|
| **Files** | ~40 files across subfolders |
| **Issues** | Not individually audited yet — will be done in Phase 1 continuation if needed. Common patterns observed: standard config CRUD, consistent use of Seyfert patterns. |
| **Verdict** | Pending detailed audit |

---

## 5. RPG

### `/rpg profile`
| Field | Value |
|-------|-------|
| **File** | `src/commands/rpg/profile.command.ts` |
| **Inputs** | None |
| **Purpose** | Show RPG profile with loadout, stats, combat record |
| **Backend deps** | `rpgProfileService`, `StatsCalculator`, `getItemDefinition`, `onboardingService`, `rpgConfigService` |
| **Issues** | Clean. Well-structured with onboarding flow. |
| **Verdict** | `OK` |

### Other RPG commands (fight, craft, gather, process, upgrade, equipment, loadout, achievements)
| Field | Value |
|-------|-------|
| **Files** | `src/commands/rpg/*.ts` (9 files) |
| **Issues** | Not individually audited yet. |
| **Verdict** | Pending detailed audit |

---

## 6. Game

### `/inventory`
| Field | Value |
|-------|-------|
| **File** | `src/commands/game/inventory.ts` (288 lines) |
| **Inputs** | `search?: string`, `category?: string (choice)`, `page?: int` |
| **Purpose** | Display inventory with pagination and inspection |
| **Backend deps** | `createEconomyAccountService`, `economyAccountRepo`, `getItemDefinition`, `startPagination` |
| **Issues** | **Redundant access check** pattern. `@ts-ignore` on line 248 for pagination types. `categoryFilter` cast `as any` (line 81). |
| **Verdict** | `fix` — Fix type issues. Remove redundant access check. |

### `/give-item`
| Field | Value |
|-------|-------|
| **File** | `src/commands/game/give-item.ts` |
| **Inputs** | `item: string`, `quantity: int`, `user: user`, `reason?: string`, `force?: bool` |
| **Purpose** | Mod-only item granting |
| **Backend deps** | `itemMutationService`, `createEconomyPermissionChecker`, `sanitizeItemId` |
| **Issues** | Clean. Good use of mutation service with permission checker. |
| **Verdict** | `OK` |

### `/remove-item`
| Field | Value |
|-------|-------|
| **File** | `src/commands/game/remove-item.ts` |
| **Inputs** | `item: string`, `quantity: int`, `user: user`, `reason?: string` |
| **Purpose** | Mod-only item removal |
| **Backend deps** | `itemMutationService`, `createEconomyPermissionChecker`, `sanitizeItemId` |
| **Issues** | Clean. Mirrors give-item well. |
| **Verdict** | `OK` |

---

## 7. AI

### AI commands (ratelimit, set-model, set-provider)
| Field | Value |
|-------|-------|
| **Files** | `src/commands/ai/*.ts` |
| **Purpose** | Configure AI features |
| **Verdict** | Pending detailed audit |

---

## 8. Automod

### Automod commands (linkspam, shorteners, whitelist, report-channel)
| Field | Value |
|-------|-------|
| **Files** | `src/commands/automod/*.ts` |
| **Purpose** | Automod configuration |
| **Verdict** | Pending detailed audit |

---

## 9. Offers

### Offers commands (create, edit, withdraw, config)
| Field | Value |
|-------|-------|
| **Files** | `src/commands/offers/*.ts` |
| **Purpose** | Job/offer management |
| **Verdict** | Pending detailed audit |

---

## 10. Fun

### `/embedplay`
| File | `src/commands/fun/embedplay.ts` |
| **Verdict** | Pending |

### `/joke`
| File | `src/commands/fun/joke.ts` |
| **Verdict** | Pending |

---

## 11. Utility

### `/suggest`
| File | `src/commands/utility/suggest.ts` |
| **Verdict** | Pending |

---

## 12. Shared Utilities

### `src/commands/economy/shared.ts`
| Field | Value |
|-------|-------|
| **Purpose** | Common helpers for economy commands |
| **Issues** | `buildBalanceFields` marked `@deprecated` but still used by deposit/withdraw. `parseAmountOrReply` and `normalizeInt` are useful but should move to a shared module. |
| **Verdict** | `fix` — Complete the deprecation migration. Move remaining utils to proper module. |

---

## Cross-Cutting Issues Summary

### 1. Redundant Pre-Checks (HIGH priority)
**Pattern**: Commands manually check feature flags, ensure accounts, verify status BEFORE calling services that internally do the same checks.
**Affected**: `/work`, `/rob`, `/trivia`, `/vote`, `/coinflip`, `/store-buy`, `/store-sell`, and more.
**Fix**: Let services handle validation; commands should just call the service and handle the Result errors.

### 2. Inconsistent Data Access (HIGH priority)
**Pattern**: Some commands use `createEconomyAccountService`, others use `UserStore` directly, others use `currencyTransaction` directly.
**Affected**: `/wallet deposit`, `/wallet withdraw`, `/remove-currency` vs all other economy commands.
**Fix**: Standardize on service layer. Remove direct repo/store access from commands.

### 3. `as any` Casts (MEDIUM priority)
**Pattern**: `currencyObj.display(amount as any)` appears in ~15+ commands.
**Root cause**: Currency display function type doesn't match how it's called.
**Fix**: Fix the `display()` type signature in the currency module.

### 4. Duplicated Code (MEDIUM priority)
- **Stats formatting**: Duplicated 3x across trinkets/trinkets-unequip/loadout
- **Rarity helpers**: Duplicated in trinkets and trinkets-unequip
- **Feature flag checks**: Duplicated in every store/trivia/vote/rob/coinflip command
- **Quest rotation lookup**: Duplicated in quest view and quest claim
- **Trivia button creation**: Duplicated in showQuestion and showExistingQuestion
- **Error message maps**: Similar patterns copied across commands

### 5. Inconsistent Logging (MEDIUM priority)
**Pattern**: Some commands use `GuildLogger.banSanctionLog`, some use `logModerationAction`, some use `new GuildLogger()`, some rely on service-layer logging.
**Fix**: Standardize on a single logging approach.

### 6. Dynamic Imports (LOW priority)
**Pattern**: `await import("@/modules/economy/permissions")` used instead of static imports.
**Affected**: `/economy-health`, `/economy-rollback`, `/event-start`, `/event-stop`, `/quest progress`, `/quest list`.
**Fix**: Convert to static imports.

### 7. Naming Confusion (LOW priority)
- `/quest` = economy quests, `/quests` = RPG quests
- `/trinkets-loadout` vs `/loadout` naming
- `banSanctionLog` used for all moderation actions, not just bans
