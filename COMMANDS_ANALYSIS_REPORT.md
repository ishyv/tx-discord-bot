# PyEBot Commands Analysis Report

> Analysis Date: 2026-02-06  
> Total Command Classes: 185

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Command Classes** | 185 |
| **Parent Commands** | ~75 |
| **SubCommands** | ~110 |
| **Duplicate Names** | 17 name collisions |
| **Categories** | 10+ |

### Critical Issues Found:
1. **17 duplicate command names** across different parent commands
2. **Same-name commands in economy vs RPG** (`equip`, `unequip`, `profile`)
3. **`quest` and `quests`** are separate when they should be one
4. **22 granular economy-config commands** need consolidation

---

## Complete Command Inventory

### AI Commands (4)
| Command | Type | Purpose |
|---------|------|---------|
| `/ai` | Parent | AI provider and model configuration |
| `/ai ratelimit` | Sub | Configure rate limits |
| `/ai set-model` | Sub | Select AI model |
| `/ai set-provider` | Sub | Select AI provider |

### Automod Commands (5)
| Command | Type | Purpose |
|---------|------|---------|
| `/automod` | Parent | Automod configuration |
| `/automod linkspam` | Sub | Configure link spam detection |
| `/automod reportchannel` | Sub | Set report channel |
| `/automod shorteners` | Sub | URL shortener settings |
| `/automod whitelist` | Sub | Manage whitelist |

### Economy Commands (78)

#### User-Facing Economy (22)
| Command | Type | Purpose | Issue |
|---------|------|---------|-------|
| `/achievements` | Parent | Achievement board | |
| `/achievements view` | Sub | View achievement | **DUPLICATE: view** |
| `/achievements claim` | Sub | Claim reward | **DUPLICATE: claim** |
| `/achievements progress` | Sub | View progress | **DUPLICATE: progress** |
| `/achievements category` | Sub | Filter by category | |
| `/balance` | Command | Show balance | |
| `/bank` | Command | Show bank breakdown | |
| `/coinflip` | Command | Bet on coin flip | |
| `/craft` | Command | Craft items | |
| `/daily` | Command | Claim daily reward | |
| `/deposit` | Command | Deposit to bank | |
| `/equip` | Command | Equip items | **CONFLICT: RPG has /equip** |
| `/loadout` | Command | Show equipped items | |
| `/perks` | Parent | View/buy perks | |
| `/perks list` | Sub | List perks | **DUPLICATE: list** |
| `/perks buy` | Sub | Buy perk | |
| `/profile` | Command | Economy profile | **CONFLICT: RPG has /profile** |
| `/progress` | Command | XP progression | |
| `/quests` | Command | Quest board | **SHOULD MERGE with /quest** |
| `/quest` | Parent | Quest management | **SHOULD MERGE with /quests** |
| `/quest view` | Sub | View quest | **DUPLICATE: view** |
| `/quest claim` | Sub | Claim reward | **DUPLICATE: claim** |
| `/quest progress` | Sub | View progress | **DUPLICATE: progress** |
| `/quest list` | Sub | List quests | **DUPLICATE: list** |
| `/rob` | Command | Steal from user | |
| `/store` | Parent | Store (buy/sell) | **DUPLICATE: economy-config has /store** |
| `/store buy` | Sub | Buy item | |
| `/store sell` | Sub | Sell item | |
| `/store list` | Sub | List items | **DUPLICATE: list** |
| `/store featured` | Sub | Featured items | |
| `/title` | Parent | Manage titles | |
| `/title set` | Sub | Equip title | **DUPLICATE: set** |
| `/title list` | Sub | List titles | **DUPLICATE: list** |
| `/title clear` | Sub | Clear title | **DUPLICATE: clear** |
| `/title badges` | Sub | Show badges | |
| `/transfer` | Command | Transfer currency | |
| `/trivia` | Command | Play trivia | **DUPLICATE: economy-config has /trivia** |
| `/unequip` | Command | Unequip items | **CONFLICT: RPG has /unequip** |
| `/vote` | Command | Cast votes | |
| `/vote-config` | Command | Vote preferences | |
| `/vote-leaderboard` | Command | Vote rankings | |
| `/withdraw` | Command | Withdraw from bank | **DUPLICATE: offers has /withdraw** |
| `/work` | Command | Work for currency | |

#### Economy Admin (20)
| Command | Type | Purpose |
|---------|------|---------|
| `/economy-freeze` | Command | Freeze user account |
| `/economy-health` | Command | Show health report | **SHOULD MERGE with /economy-sectors** |
| `/economy-peek` | Command | Moderator data view |
| `/economy-report` | Command | Generate reports |
| `/economy-rollback` | Command | Rollback operations |
| `/economy-sectors` | Command | Show sector balances | **SHOULD MERGE with /economy-health** |
| `/economy-unfreeze` | Command | Unfreeze account |
| `/give-currency` | Command | Admin: give currency |
| `/remove-currency` | Command | Admin: remove currency |
| `/event` | Parent | View current event |
| `/event-start` | Sub | Start event | |
| `/event-stop` | Sub | Stop event | |
| `/event-launch-week` | Command | Quick start Launch Week |
| `/ops` | Command | Operations config | |

#### Economy Config Commands (22 - TOO MANY!)
| Command | Category |
|---------|----------|
| `/economy-config` | Parent |
| `/economy-config view` | View config |
| `/economy-config set-daily-fee-rate` | Daily config |
| `/economy-config set-daily-fee-sector` | Daily config |
| `/economy-config set-daily-streak-bonus` | Daily config |
| `/economy-config set-daily-streak-cap` | Daily config |
| `/economy-config set-work-base-mint` | Work config |
| `/economy-config set-work-bonus-max` | Work config |
| `/economy-config set-work-bonus-mode` | Work config |
| `/economy-config set-work-cooldown-minutes` | Work config |
| `/economy-config set-work-currency-id` | Work config |
| `/economy-config set-work-daily-cap` | Work config |
| `/economy-config set-work-failure-chance` | Work config |
| `/economy-config set-work-pays-from-sector` | Work config |
| `/economy-config set-work-reward-base` | Work config |
| `/economy-config tax-rate` | Tax config |
| `/economy-config tax-sector` | Tax config |
| `/economy-config thresholds` | Threshold config |
| `/economy-config store` | Store config | **DUPLICATE: main /store** |
| `/economy-config trivia` | Trivia config | **DUPLICATE: main /trivia** |
| `/economy-config set-xp` | XP config |
| `/economy-config feature` | Feature toggles |

#### Economy Audit (2)
| Command | Type |
|---------|------|
| `/economy-audit` | Parent |
| `/economy-audit recent` | Sub |

#### Store Admin (4)
| Command | Type | Issue |
|---------|------|-------|
| `/store-admin` | Parent | |
| `/store-admin add` | Sub | **DUPLICATE: add** |
| `/store-admin edit` | Sub | **DUPLICATE: edit** |
| `/store-admin remove` | Sub | **DUPLICATE: remove** |

#### Trivia Admin (1)
| Command | Type |
|---------|------|
| `/trivia-admin` | Command |

### Fun Commands (2)
| Command | Type |
|---------|------|
| `/embedplay` | Command |
| `/joke` | Command |

### Game Commands (3)
| Command | Type | Issue |
|---------|------|-------|
| `/inventory` | Command | **SHOULD MERGE with economy equip/loadout** |
| `/give-item` | Command | Admin: give items |
| `/remove-item` | Command | Admin: remove items |

### Moderation Commands (46)

#### Ban/Kick/Mute/Restrict (4)
| Command | Type |
|---------|------|
| `/ban` | Command |
| `/kick` | Command |
| `/mute` | Command |
| `/restrict` | Command |

#### Cases (1)
| Command | Type |
|---------|------|
| `/cases` | Command |

#### Warn System (5)
| Command | Type | Issue |
|---------|------|-------|
| `/warn` | Parent | |
| `/warn add` | Sub | **DUPLICATE: add** |
| `/warn remove` | Sub | **DUPLICATE: remove** |
| `/warn list` | Sub | **DUPLICATE: list** |
| `/warn clear` | Sub | **DUPLICATE: clear** |

#### Autorole (10)
| Command | Type | Issue |
|---------|------|-------|
| `/autorole` | Parent | |
| `/autorole create` | Sub | **DUPLICATE: create** |
| `/autorole delete` | Sub | **DUPLICATE: remove** |
| `/autorole enable` | Sub | |
| `/autorole disable` | Sub | |
| `/autorole help` | Sub | |
| `/autorole list` | Sub | **DUPLICATE: list** |
| `/autorole preset` | Sub | |
| `/autorole purge` | Sub | |

#### Channels (5)
| Command | Type | Issue |
|---------|------|-------|
| `/channels` | Parent | |
| `/channels add` | Sub | **DUPLICATE: add** |
| `/channels remove` | Sub | **DUPLICATE: remove** |
| `/channels list` | Sub | **DUPLICATE: list** |
| `/channels set` | Sub | **DUPLICATE: set** |

#### Forums (5)
| Command | Type | Issue |
|---------|------|-------|
| `/forums` | Parent | |
| `/forums add` | Sub | **DUPLICATE: add** |
| `/forums remove` | Sub | **DUPLICATE: remove** |
| `/forums list` | Sub | **DUPLICATE: list** |
| `/forums config` | Sub | **DUPLICATE: config** |

#### Rep System (5)
| Command | Type | Issue |
|---------|------|-------|
| `/rep` | Parent | |
| `/rep add` | Sub | **DUPLICATE: add** |
| `/rep remove` | Sub | **DUPLICATE: remove** |
| `/rep request` | Sub | |
| `/rep config` | Sub | **DUPLICATE: config** |

#### Roles (8)
| Command | Type | Issue |
|---------|------|-------|
| `/roles` | Parent | |
| `/roles set` | Sub | **DUPLICATE: set** |
| `/roles remove` | Sub | **DUPLICATE: remove** |
| `/roles list` | Sub | **DUPLICATE: list** |
| `/roles set-limit` | Sub | |
| `/roles clear-limit` | Sub | |
| `/roles control` | Sub | |
| `/roles dashboard` | Sub | |

#### Tickets (4)
| Command | Type | Issue |
|---------|------|-------|
| `/tickets` | Parent | |
| `/tickets config` | Sub | **DUPLICATE: config** |
| `/tickets close-all` | Sub | |

#### Tops (2)
| Command | Type | Issue |
|---------|------|-------|
| `/tops` | Parent | |
| `/tops config` | Sub | **DUPLICATE: config** |

### Offers Commands (5)
| Command | Type | Issue |
|---------|------|-------|
| `/offer` | Command | |
| `/offer create` | Sub | **DUPLICATE: create** |
| `/offer edit` | Sub | **DUPLICATE: edit** |
| `/offer withdraw` | Sub | **DUPLICATE: withdraw** |
| `/offer config` | Sub | **DUPLICATE: config** |

### RPG Commands (15)
| Command | Type | Issue |
|---------|------|-------|
| `/rpg` | Parent | |
| `/rpg profile` | Sub | **CONFLICT: economy has /profile** |
| `/rpg loadout` | Sub | **CONFLICT: economy has /loadout** |
| `/rpg equip` | Sub | **CONFLICT: economy has /equip** |
| `/rpg unequip` | Sub | **CONFLICT: economy has /unequip** |
| `/cutdown` | Command | Gather wood |
| `/mine` | Command | Gather ores |
| `/fight` | Command | Combat |
| `/process` | Command | Process materials |
| `/upgrade-tool` | Command | Upgrade tools |

### Utility Commands (1)
| Command | Type |
|---------|------|
| `/suggest` | Command |

### System Commands (2)
| Command | Type |
|---------|------|
| `/ping` | Command |
| `/rui-test` | Command |

---

## Duplicate Name Analysis

### Critical Conflicts (Same Name, Different Function)

| Name | Locations | Impact |
|------|-----------|--------|
| **equip** | economy/equip.ts, rpg/equip.command.ts | HIGH - User confusion |
| **unequip** | economy/unequip.ts, rpg/unequip.command.ts | HIGH - User confusion |
| **profile** | economy/profile.ts, rpg/profile.command.ts | HIGH - User confusion |
| **store** | economy/store.ts, economy-config/set-store.command.ts | MEDIUM - Config vs Usage |
| **trivia** | economy/trivia.ts, economy-config/set-trivia.command.ts | MEDIUM - Config vs Usage |
| **withdraw** | economy/withdraw.ts, offers/withdraw.ts | MEDIUM - Different contexts |

### Subcommand Name Duplicates (Expected but Noted)

| Name | Count | Parent Commands |
|------|-------|-----------------|
| **list** | 9 | achievements, perks, quest, title, autorole, channels, forums, roles, warn |
| **add** | 5 | store-admin, channels, forums, rep, warn |
| **remove** | 6 | store-admin, channels, forums, rep, roles, warn |
| **view** | 3 | achievements, quest, economy-config |
| **config** | 5 | tickets, tops, forums, rep, offers |
| **set** | 3 | title, channels, roles |
| **create** | 2 | autorole, offers |
| **edit** | 2 | store-admin, offers |
| **claim** | 2 | achievements, quest |
| **progress** | 2 | achievements, quest |
| **clear** | 2 | title, warn |

---

## Recommended Mergers & Consolidations

### 🔴 HIGH PRIORITY - Merge Immediately

#### 1. Merge `/quest` and `/quests`
**Current:**
- `/quests` - View quest board
- `/quest view <id>` - View specific quest
- `/quest claim <id>` - Claim rewards
- `/quest progress` - View progress
- `/quest list` - List quests

**Proposed:**
```
/quest                    # Default: show board
/quest board [tab]        # Quest board with tabs
/quest view <id>          # View specific quest
/quest claim <id>         # Claim rewards
/quest progress           # View progress
```

#### 2. Unify `/profile` Commands
**Current:**
- `/profile` (economy) - Economy profile
- `/profile` (rpg) - RPG profile

**Proposed:**
```
/profile                  # Combined view
/profile economy          # Economy details
/profile rpg              # RPG details
```

#### 3. Unify Equipment Commands
**Current Chaos:**
- `/equip` (economy) - Equip items
- `/equip` (rpg) - Equip RPG items
- `/unequip` (economy) - Unequip
- `/unequip` (rpg) - Unequip RPG
- `/loadout` (economy) - View equipment
- `/rpg loadout` - View RPG equipment
- `/inventory` (game) - Inventory

**Proposed:**
```
/inventory                # View all items
/inventory equip <item>   # Equip item
/inventory unequip [slot] # Unequip
/inventory loadout        # View equipment
/inventory craft          # Crafting
/inventory store          # Store
```

#### 4. Merge `/economy-sectors` and `/economy-health`
**Proposed:**
```
/economy-health           # Combined health + sectors view
```

### 🟡 MEDIUM PRIORITY - Consolidate

#### 5. Group Economy Config Commands
**Current:** 22 separate commands

**Proposed:**
```
/economy-config daily <setting> <value>
/economy-config work <setting> <value>
/economy-config tax <setting> <value>
/economy-config store <setting> <value>
/economy-config trivia <setting> <value>
/economy-config xp <setting> <value>
```

Settings available via autocomplete.

#### 6. Rename Conflicting Commands
- `/economy-config store` → `/economy-config store-settings`
- `/economy-config trivia` → `/economy-config trivia-settings`
- `/offers withdraw` → `/offers retract` or `/offer-cancel`

#### 7. Consolidate Admin Store Commands
**Current:**
- `/store-admin add`
- `/store-admin edit`
- `/store-admin remove`

**Proposed:**
```
/economy-config store items add
/economy-config store items edit
/economy-config store items remove
```

### 🟢 LOW PRIORITY - Consider for Future

#### 8. Merge Achievement/Progress/Quest Views
Consider combining progress tracking:
```
/progress                 # Unified progress view
/progress xp              # XP/Level details
/progress achievements    # Achievement details
/progress quests          # Quest progress
```

#### 9. Simplify Economy Admin
```
/economy-admin freeze <user>
/economy-admin unfreeze <user>
/economy-admin peek <user>
/economy-admin rollback <id>
/economy-admin report
```

---

## New Command Structure (Proposed)

### Economy Module
```
/balance, /bank, /daily, /work, /transfer, /rob
/coinflip, /trivia, /vote, /vote-leaderboard, /vote-config

/inventory (replaces equip, unequip, loadout, craft, store)
  - view, equip, unequip, craft, store

/quest (merged with quests)
  - board, view, claim, progress

/profile (unified)
  - economy, rpg, achievements, progress

/economy-config (consolidated)
  - daily, work, tax, store, trivia, xp
  - view

/event
  - start, stop

/economy-admin
  - freeze, unfreeze, peek, rollback, report
  - give-currency, remove-currency
```

### RPG Module
```
/rpg (parent only - subcommands merged into main commands)

Remaining RPG-specific:
/cutdown, /mine, /fight, /process, /upgrade-tool
```

---

## Command Count Comparison

| Category | Current | After Merge | Reduction |
|----------|---------|-------------|-----------|
| Economy Parent | 39 | 25 | 36% |
| Economy Config | 22 | 7 | 68% |
| RPG | 15 | 5 | 67% |
| Equipment/Inventory | 17 | 1 | 94% |
| **Total** | **~185** | **~130** | **30%** |

---

## Implementation Priority

### Phase 1: Critical Conflicts
1. Merge `/quest` + `/quests`
2. Unify `/profile` commands
3. Consolidate equipment system

### Phase 2: Config Consolidation
4. Group economy-config commands
5. Rename conflicting command names

### Phase 3: Cleanup
6. Merge `/economy-sectors` + `/economy-health`
7. Consolidate admin commands
8. Update documentation

---

*End of Report*
