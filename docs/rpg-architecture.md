# RPG System Architecture

> **Purpose**: Architecture documentation for the PyEBot RPG module layered on top of the economy system.

---

## Module Map

```
src/modules/rpg/
├── index.ts                    # Public API exports
├── types.ts                    # Shared RPG types
├── config.ts                   # RPG constants and balancing
├── profile/
│   ├── types.ts               # RPG profile domain types
│   ├── schema.ts              # Zod schemas for persistence
│   ├── repository.ts          # Profile CRUD with ensure pattern
│   └── service.ts             # Profile lifecycle (auto-create, gating)
├── stats/
│   ├── types.ts               # Stat calculation types
│   └── calculator.ts          # Pure stat calculator (ATK/DEF/HP)
├── equipment/
│   ├── types.ts               # Equipment operation types
│   ├── service.ts             # Equip/unequip with combat lock
│   └── validation.ts          # Equipment constraints
├── combat/
│   ├── types.ts               # Combat session types
│   ├── engine.ts              # Damage calculation, RNG
│   ├── session.ts             # Fight session manager (TTL)
│   └── service.ts             # Invite/accept/resolve flow
├── gathering/
│   ├── types.ts               # Gathering operation types
│   ├── definitions.ts         # Tool tiers, location tiers
│   └── service.ts             # Mine/cutdown with durability
├── processing/
│   ├── types.ts               # Processing operation types
│   ├── recipes.ts             # Raw -> processed mappings
│   └── service.ts             # Process with luck modifier
├── upgrades/
│   ├── types.ts               # Upgrade operation types
│   ├── definitions.ts         # Tier costs and requirements
│   └── service.ts             # Tool upgrade flow
└── views/
    ├── embeds.ts              # Profile/combat embeds
    ├── combat-log.ts          # Combat log formatting
    └── hp-bar.ts              # HP bar visualizer
```

---

## Data Flows

### 1. Profile Auto-Creation Flow

```
RPG Command
    ↓
ProfileService.ensure(userId)
    ↓
EconomyAccountRepo.ensure(userId) ──→ Gate: status must be "ok"
    ↓                                    ↓
    └────────────────────────────────────┘
    ↓
RPGProfileRepo.ensure(userId) ──────→ Creates if missing
    ↓
Returns Profile + isNew flag
```

**Invariants**:
- RPG profile cannot exist without economy account
- Blocked/banned accounts cannot create RPG profiles
- Profile creation is idempotent (safe to call multiple times)

### 2. Equipment Flow

```
Equip Request
    ↓
Gate: isFighting === false
    ↓
Inventory check: item must exist
    ↓
Unequip current slot item (if any)
    ↓
ItemMutationService.removeItem(itemId, 1)
    ↓
Update profile.equipment[slot] = itemId
    ↓
Recalculate stats via StatsCalculator
    ↓
Audit: item_equip with correlationId
```

**Invariants**:
- Equipment changes blocked during combat
- One item per slot (new equip auto-unequips previous)
- Unequipped items return to inventory (capacity check)
- Stats recalculated atomically

### 3. Combat Flow

```
Fight Invite
    ↓
Verify both profiles exist
    ↓
Verify neither isFighting
    ↓
Create CombatSession (TTL 5 min)
    ↓
[Async] Target accepts
    ↓
Lock both: isFighting = true
    ↓
Initialize combat state
    ↓
Round Loop:
    ├── Collect moves simultaneously
    ├── Resolve via CombatEngine
    ├── Update HP
    └── Log round results
    ↓
Combat End:
    ├── Update wins/losses
    ├── Restore HP
    └── Unlock: isFighting = false
```

**Invariants**:
- Seeded RNG for reproducibility
- Simultaneous resolution (no first-mover advantage)
- Combat sessions auto-expire (TTL cleanup)
- Minimum 1 damage per hit

### 4. Gathering Flow

```
Mine/Cutdown
    ↓
Validate tool in inventory
    ↓
Validate tool tier ≥ location tier
    ↓
Consume 1 durability
    ↓
Yield = random(2, 5) of location material
    ↓
If durability == 0: Tool breaks (remove item)
    ↓
Add materials to inventory
    ↓
Audit with correlationId
```

**Invariants**:
- Tool tier gates location access
- Durability decrements atomically
- Broken tools removed from inventory
- Materials stack normally

### 5. Processing Flow

```
Process Materials
    ↓
Validate: 2 raw materials in inventory
    ↓
Remove 2 raw materials
    ↓
Calculate success chance:
    ├── Base: 62%
    └── + luck perk %
    ↓
RNG check
    ↓
Success: Add 1 processed material
    Failure: Materials consumed, no output
    ↓
Deduct fee (percentage of value) → Guild economy
    ↓
Audit result
```

**Invariants**:
- Fee always deducted (success or failure)
- Luck capped at reasonable maximum
- Atomic inventory updates

### 6. Upgrade Flow

```
Upgrade Tool
    ↓
Validate tool ownership
    ↓
Check no higher tier owned
    ↓
Validate materials (5 units)
    ↓
Validate money cost
    ↓
Atomic deduction:
    ├── Remove tool
    ├── Remove materials
    └── Deduct money
    ↓
Add new tier tool (full durability)
    ↓
Audit upgrade
```

**Invariants**:
- Original tool consumed
- One-way progression (no downgrades)
- All costs validated before mutation

---

## Key Invariants

### Data Integrity
1. **Equipment Slot Uniqueness**: Only one item per equipment slot
2. **Combat Lock**: `isFighting` flag prevents equipment changes and multiple fights
3. **Stat Consistency**: Stats always derived from equipped items (never cached)
4. **HP Boundaries**: Current HP never exceeds max HP

### Economy Integration
1. **Account Gating**: RPG requires economy account in "ok" status
2. **Inventory Mutations**: All item changes via `ItemMutationService`
3. **Currency Mutations**: All money changes via `CurrencyMutationService`
4. **Audit Trail**: Every RPG operation has audit entry with correlationId

### Combat Fairness
1. **Simultaneous Resolution**: Both moves resolved together (no turn order)
2. **Seeded RNG**: Combat RNG seeded at session start for reproducibility
3. **Minimum Damage**: Every successful hit deals at least 1 damage
4. **TTL Cleanup**: Abandoned sessions auto-expire

### Tool Durability
1. **Per-Use Decay**: Each gathering use consumes exactly 1 durability
2. **Break at Zero**: Tool removed from inventory at 0 durability
3. **Tier Gating**: Cannot use lower-tier tools at higher-tier locations

---

## Integration Points

### With Economy System
| RPG Feature | Economy Integration |
|-------------|---------------------|
| Profile creation | `EconomyAccountRepo.ensure()` |
| Item equip/unequip | `ItemMutationService.adjustItemQuantity()` |
| Upgrade costs | `CurrencyMutationService.transferCurrency()` |
| Processing fees | Guild economy contribution |
| Luck modifier | `perkService.getPerkLevel()` |

### With Inventory System
| RPG Feature | Inventory Integration |
|-------------|----------------------|
| Equip validation | `hasItem()` check |
| Unequip return | Capacity-constrained add |
| Tool durability | Non-stackable item tracking |
| Material yields | Stackable item addition |

### With Audit System
| RPG Operation | Audit Type |
|---------------|------------|
| Equip/Unequip | `item_equip` / `item_unequip` |
| Combat result | `combat_result` |
| Gathering | `gathering` |
| Processing | `craft` |
| Upgrade | `item_upgrade` |

---

## Configuration Knobs

### Combat Balance (`config.ts`)
```typescript
const COMBAT_CONFIG = {
  baseMaxHp: 100,
  damageVariance: { min: 0.95, max: 1.25 },
  critMultiplier: { min: 1.5, max: 2.0 },
  critChance: 0.20,
  blockChance: 0.50,
  blockDamageReduction: { min: 0.70, max: 1.0 },
  defenseReduction: { min: 0.5, max: 1.0 },
  minDamage: 1,
};
```

### Gathering Balance
```typescript
const GATHERING_CONFIG = {
  baseYield: { min: 2, max: 5 },
  durabilityByTier: [10, 25, 50, 70],
};
```

### Processing Balance
```typescript
const PROCESSING_CONFIG = {
  baseSuccessRate: 0.62,
  luckMultiplier: 0.01, // +1% per luck level
  maxLuckBonus: 0.25,   // Cap at +25%
  feePercent: 0.10,     // 10% of material value
};
```

### Upgrade Costs
```typescript
const UPGRADE_CONFIG = {
  costs: [
    { tier: 1, money: 10000, materials: [{ id: "spruce_wood", qty: 5 }] },
    { tier: 2, money: 20000, materials: [{ id: "copper_ingot", qty: 5 }] },
    { tier: 3, money: 30000, materials: [{ id: "palm_wood", qty: 5 }] },
    { tier: 4, money: 40000, materials: [{ id: "silver_ore", qty: 5 }] },
  ],
};
```

---

## Error Handling

All RPG operations return `Result<T, RpgError>`:

```typescript
class RpgError extends Error {
  constructor(
    public readonly code: RpgErrorCode,
    message: string,
  ) { super(message); }
}

type RpgErrorCode =
  | "PROFILE_NOT_FOUND"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_BANNED"
  | "IN_COMBAT"
  | "NOT_IN_COMBAT"
  | "ITEM_NOT_IN_INVENTORY"
  | "INVALID_EQUIPMENT_SLOT"
  | "COMBAT_SESSION_EXPIRED"
  | "INSUFFICIENT_TOOL_TIER"
  | "TOOL_BROKEN"
  | "INSUFFICIENT_MATERIALS"
  | "INSUFFICIENT_FUNDS"
  | "ALREADY_OWNS_HIGHER_TIER"
  | "PROCESSING_FAILED";
```

---

## Testing Strategy

### Unit Tests
- `stats/calculator.test.ts` - Pure stat calculations
- `combat/engine.test.ts` - Damage formulas, RNG
- `views/hp-bar.test.ts` - Visual formatting

### Integration Tests
- `rpg-profile.int.test.ts` - Profile ensure, gating
- `rpg-equipment.int.test.ts` - Equip/unequip with combat lock
- `rpg-combat.int.test.ts` - Full fight lifecycle
- `rpg-gathering.int.test.ts` - Durability decay, tool breaking
- `rpg-processing.int.test.ts` - Success/failure paths
- `rpg-upgrades.int.test.ts` - Tier progression
