# RPG Commands Reference

> **Purpose**: Command documentation for the PyEBot RPG system.

---

## Profile Commands

### `/rpg profile [user]`
Display RPG profile with stats, equipment, and combat record.

**Parameters:**
- `user` (optional): View another user's profile

**Example:**
```
/rpg profile
/rpg profile @User
```

---

## Equipment Commands

### `/rpg equip <item> <slot>`
Equip an item to a specific slot.

**Parameters:**
- `item`: Item name from inventory
- `slot`: Equipment slot (weapon/shield/helmet/chest/pants/boots/ring/necklace)

**Example:**
```
/rpg equip wooden_sword weapon
/rpg equip iron_shield shield
```

**Errors:**
- Item not in inventory
- Invalid slot for item type
- In combat (equipment locked)

### `/rpg unequip <slot>`
Unequip item from a slot, returns to inventory.

**Parameters:**
- `slot`: Equipment slot to unequip

**Example:**
```
/rpg unequip weapon
```

---

## Combat Commands

### `/rpg fight <user>`
Challenge a user to combat.

**Parameters:**
- `user`: Target user to fight

**Example:**
```
/rpg fight @User
```

**Flow:**
1. Sends invite to target
2. Target accepts with button
3. Both players submit moves simultaneously
4. Round resolves when both moves received
5. Repeat until HP reaches 0

### `/rpg move <type>`
Submit combat move for current round.

**Parameters:**
- `type`: `attack` or `block`

**Example:**
```
/rpg move attack
/rpg move block
```

### `/rpg forfeit`
Surrender current combat.

**Example:**
```
/rpg forfeit
```

---

## Gathering Commands

### `/rpg mine <location>`
Mine for ore at a location.

**Parameters:**
- `location`: Mine location ID
  - `stone_mine` - Tier 1 (pickaxe)
  - `copper_mine` - Tier 2 (pickaxe lv.2)
  - `iron_mine` - Tier 3 (pickaxe lv.3)
  - `silver_mine` - Tier 4 (pickaxe lv.4)

**Example:**
```
/rpg mine stone_mine
```

### `/rpg cutdown <location>`
Cut wood at a forest location.

**Parameters:**
- `location`: Forest location ID
  - `oak_forest` - Tier 1 (axe)
  - `spruce_forest` - Tier 2 (axe lv.2)
  - `palm_forest` - Tier 3 (axe lv.3)
  - `pine_forest` - Tier 4 (axe lv.4)

**Example:**
```
/rpg cutdown oak_forest
```

**Note:** Each gathering attempt consumes 1 tool durability. Tools break at 0 durability.

---

## Processing Commands

### `/rpg process <material> [batches]`
Process raw materials into refined materials.

**Parameters:**
- `material`: Raw material to process
- `batches` (optional): Number of batches (default: 1)

**Recipes:**
- 2 Copper Ore → 1 Copper Ingot (62% base success)
- 2 Iron Ore → 1 Iron Ingot (62% base success)
- 2 Silver Ore → 1 Silver Ingot (62% base success)
- 2 Gold Ore → 1 Gold Ingot (62% base success)

**Example:**
```
/rpg process copper_ore
/rpg process iron_ore 5
```

**Notes:**
- Fee charged per batch (10% of material value)
- Luck perk increases success chance (+1% per level, max +25%)
- Materials consumed on both success and failure

---

## Upgrade Commands

### `/rpg upgrade check <tool>`
Check upgrade requirements for a tool.

**Parameters:**
- `tool`: Tool item ID to check

**Example:**
```
/rpg upgrade check pickaxe
```

### `/rpg upgrade confirm <tool>`
Upgrade tool to next tier.

**Parameters:**
- `tool`: Tool item ID to upgrade

**Example:**
```
/rpg upgrade confirm pickaxe
```

**Upgrade Costs:**
| Tier | Money | Materials |
|------|-------|-----------|
| 1→2 | 10,000 | 5 Spruce Wood |
| 2→3 | 20,000 | 5 Copper Ingots |
| 3→4 | 30,000 | 5 Palm Wood |

**Notes:**
- Original tool consumed
- Cannot upgrade if higher tier owned
- Equipment locked during combat

---

## Stats Reference

### Base Stats
| Stat | Base Value |
|------|------------|
| HP | 100 |
| ATK | 0 |
| DEF | 0 |

### Equipment Bonuses
Equipment adds bonuses to base stats:
- Weapons: +ATK
- Shields: +DEF, enables blocking
- Armor (helmet/chest/pants/boots): +DEF
- Accessories (ring/necklace): Variable

### Combat Mechanics
- **Damage variance**: ±25% random variation
- **Critical hits**: 20% chance, 150-200% damage
- **Block chance**: 50% (requires shield), 70-100% damage reduction
- **Minimum damage**: 1 (attacks always deal at least 1 damage)

---

## Configuration Knobs

Environment variables (optional):
```env
# Combat balance
RPG_COMBAT_BASE_HP=100
RPG_COMBAT_CRIT_CHANCE=0.20
RPG_COMBAT_BLOCK_CHANCE=0.50

# Gathering
RPG_GATHERING_BASE_YIELD_MIN=2
RPG_GATHERING_BASE_YIELD_MAX=5

# Processing
RPG_PROCESSING_BASE_SUCCESS=0.62
RPG_PROCESSING_MAX_LUCK_BONUS=0.25
RPG_PROCESSING_FEE_PERCENT=0.10
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| `PROFILE_NOT_FOUND` | RPG profile doesn't exist |
| `ACCOUNT_BLOCKED` | Economy account blocked |
| `ACCOUNT_BANNED` | Economy account banned |
| `IN_COMBAT` | User is currently fighting |
| `ITEM_NOT_IN_INVENTORY` | Item not found in inventory |
| `INVALID_EQUIPMENT_SLOT` | Item can't go in that slot |
| `INSUFFICIENT_TOOL_TIER` | Tool tier too low for location |
| `TOOL_BROKEN` | Tool has 0 durability |
| `INSUFFICIENT_MATERIALS` | Not enough materials |
| `INSUFFICIENT_FUNDS` | Not enough money |
| `ALREADY_OWNS_HIGHER_TIER` | Already have better version |
| `COMBAT_SESSION_EXPIRED` | Combat invite timed out |
