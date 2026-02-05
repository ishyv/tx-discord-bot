# DarkH Bot - RPG System Design Document

> **Purpose**: This document describes the conceptual architecture and design of the DarkH Discord bot's RPG system. It focuses on ideas, mechanics, and concepts rather than implementation details, intended for re-implementing these features in other codebases.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Character System](#character-system)
3. [Equipment System](#equipment-system)
4. [Combat System](#combat-system)
5. [Item Properties & Stats](#item-properties--stats)
6. [Tool & Gathering System](#tool--gathering-system)
7. [Crafting System](#crafting-system)
8. [Upgrade System](#upgrade-system)
9. [Inventory Integration](#inventory-integration)
10. [Progression & Tracking](#progression--tracking)

---

## Core Concepts

### Dual-Layer Character System
The RPG system operates alongside the economy system, creating a dual-layer character progression:
- **Economy Layer**: Money, items, trading, social status
- **RPG Layer**: Combat stats, equipment, battle record

### Account Auto-Creation
RPG profiles are created automatically when users first interact with RPG commands, inheriting from the economy account system.

### Stat-Based Combat
Combat outcomes are determined by character stats rather than player skill, with random variance adding unpredictability.

---

## Character System

### Base Character Stats

Every character has four core statistics:

| Stat | Description | Base Value |
|------|-------------|------------|
| `HP` (Health Points) | Current health in combat | 100 |
| `Max HP` | Maximum health capacity | 100 |
| `ATK` (Attack) | Damage output potential | 0 |
| `DEF` (Defense) | Damage reduction capability | 0 |

### Stat Calculation
Character stats are dynamically calculated based on equipped items:
- Base stats are minimal (0 ATK, 0 DEF)
- Equipment provides additive bonuses
- Stats recalculate whenever equipment changes
- HP cannot exceed Max HP through equipment

### Combat State Tracking
Characters maintain a combat state flag to prevent:
- Multiple simultaneous fights
- Equipment changes during combat
- Exploits through state manipulation

---

## Equipment System

### Equipment Slots

The system uses an 8-slot equipment framework:

| Slot | Type | Stat Contribution |
|------|------|-------------------|
| `weapon` | Weapon | ATK primary |
| `shield` | Shield | DEF + Block ability |
| `helmet` | Head Armor | DEF minor |
| `chest` | Body Armor | DEF moderate |
| `pants` | Leg Armor | DEF minor |
| `boots` | Foot Armor | DEF minimal |
| `ring` | Accessory | Variable bonuses |
| `necklace` | Accessory | Variable bonuses |

### Equipment Categories

#### 1. Weapons
- **Primary stat**: ATK (Attack damage)
- **Properties**: Direct damage addition to ATK stat
- **Examples**: Knives, swords (various materials)
- **Stacking**: Non-stackable (single units)

#### 2. Shields
- **Primary function**: Enables blocking mechanic
- **Secondary stat**: DEF bonus
- **Special**: Without a shield, blocking chance is significantly reduced or impossible
- **Stacking**: Non-stackable

#### 3. Armor Pieces (Helmet/Chest/Pants/Boots)
- **Primary stat**: DEF (Defense)
- **Coverage**: Different slots provide varying DEF amounts (chest > helmet > pants > boots)
- **Stacking**: Non-stackable per slot

#### 4. Accessories (Ring/Necklace)
- **Flexibility**: Can provide any stat combination
- **Purpose**: Fine-tuning character builds
- **Examples**: Health rings, attack necklaces

### Equipment Constraints

#### Slot Uniqueness
- Only one item per equipment slot at a time
- Equipping a new item to an occupied slot automatically unequips the previous item
- Unequipped items return to inventory if space permits

#### Equip Requirements
- Item must exist in player's inventory to equip
- Items cannot be equipped during combat
- Some items may have level/perk requirements (extensible design)

---

## Combat System

### Combat Initiation
- Turn-based PvP system
- Requires both participants to have RPG profiles
- Target must accept invitation (asynchronous confirmation)
- Both participants marked as `is_fighting = true` during combat

### Combat Structure

#### Turn Resolution
- **Simultaneous turns**: Both players choose moves simultaneously
- **Round-based**: Combat proceeds in rounds until conclusion
- **Visual representation**: HP bars display current health percentage

#### Move Types

| Move | Trigger Condition | Effect |
|------|-------------------|--------|
| `Block` | Random chance + shield equipped | Negates most/all incoming damage |
| `Failed Block` | Attempted block but failed | Minimal defense applied |
| `Normal Attack` | Default action | Standard damage calculation |
| `Critical Hit` | Random chance (~20%) | 150-200% damage multiplier |

#### Move Probabilities
- **Block chance**: Base ~50%, requires shield
- **Critical chance**: Base ~20%
- **Failed block**: When block attempt fails (~20% chance when blocking)

### Damage Calculation

#### Attack Damage Formula
```
Base Attack = Attacker's ATK stat
Variance = ±25% random variation

Normal Attack: Damage = random(ATK * 0.95, ATK * 1.25)
Critical Hit:  Damage = random(ATK * 1.5, ATK * 2.0)
```

#### Defense Application
```
Damage Reduction = random(DEF * 0.5, DEF)
Final Damage = max(1, Calculated Damage - Damage Reduction)
```

#### Block Mechanics
- Successful block: Defense absorbs 70-100% of incoming damage
- Failed block: Defense absorbs 0-5% of incoming damage
- Minimum damage: 1 (attacks always deal at least 1 damage)

### Combat Resolution

#### Victory Conditions
- Combat ends when either participant's HP ≤ 0
- Winner determined by remaining HP
- Loser is the participant who reaches ≤ 0 HP first

#### Post-Combat
- Both participants' combat flags cleared
- Winner: `wins` counter incremented
- Loser: `losses` counter incremented
- Full HP restored after combat (or partial, design choice)

#### Round Scaling (Optional Extension)
- Every N rounds (e.g., 10), both participants gain ATK boost
- Prevents endless defensive battles
- Escalation: +N*2% ATK per milestone round

---

## Item Properties & Stats

### Item Property System
Items define their RPG contributions through a properties dictionary:

```
properties = {
    "atk": numeric_value,    # Adds to attack stat
    "def": numeric_value,    # Adds to defense stat
    "hp": numeric_value,     # Adds to max HP
    # Extensible for future stats
}
```

### Property Stacking
- All equipped item properties sum together
- No diminishing returns (linear stacking)
- Properties only apply while item is equipped

### Item Type Classification

| Type | Can Equip | Slot Assignment |
|------|-----------|-----------------|
| `weapon` | Yes | weapon |
| `shield` | Yes | shield |
| `helmet` | Yes | helmet |
| `chest` | Yes | chest |
| `pants` | Yes | pants |
| `boots` | Yes | boots |
| `ring` | Yes | ring |
| `necklace` | Yes | necklace |
| `tool` | Yes | weapon (optional) |
| `food` | No | N/A |
| `material` | No | N/A |

---

## Tool & Gathering System

### Tool Tiers
Tools exist in 4 tiers with ascending effectiveness:

| Tier | Name Pattern | Durability | Yield Quality |
|------|--------------|------------|---------------|
| 1 | Basic (e.g., "Pickaxe") | Low | Basic materials |
| 2 | Enhanced (e.g., "Pickaxe Lv. 2") | Moderate | Tier 2 materials |
| 3 | Advanced (e.g., "Pickaxe Lv. 3") | High | Tier 3 materials |
| 4 | Master (e.g., "Pickaxe Lv. 4") | Very High | Tier 4 materials |

### Tool Types

#### Mining Tools (Pickaxes)
- Used to extract minerals and ores
- Tier determines which materials can be gathered
- Each tier yields corresponding tier materials

#### Woodcutting Tools (Axes)
- Used to harvest wood from forests
- Tier determines wood quality gathered
- Each tier yields corresponding tier wood types

### Durability System

#### Usage Mechanics
- Each use consumes 1 durability point
- When durability reaches 0, tool breaks and is destroyed
- Durability is item-specific (stored per instance)

#### Durability by Tier
| Tier | Durability Range |
|------|------------------|
| 1 | ~10 uses |
| 2 | ~25 uses |
| 3 | ~50 uses |
| 4 | ~70 uses |

### Gathering Locations

#### Tiered Access
- Locations divided into 4 difficulty tiers
- Each tier requires corresponding tool tier
- Higher tiers yield more valuable materials

#### Material Yields
- Basic yield: 2-5 units per successful gathering
- Random variation in quantity
- Material type determined by location tier

### Material Types

#### Ores/Minerals (Mining)
| Tier | Materials |
|------|-----------|
| 1 | Stone |
| 2 | Copper Ore |
| 3 | Iron Ore |
| 4 | Silver Ore |
| 5+ | Gold Ore (special) |

#### Wood Types (Woodcutting)
| Tier | Materials |
|------|-----------|
| 1 | Oak Wood |
| 2 | Spruce Wood |
| 3 | Palm Wood |
| 4 | Pine Wood |

---

## Crafting System

### Material Processing
- **Input**: 2 units of raw material (ore/wood)
- **Output**: 1 unit of processed material (ingot/processed wood)
- **Success rate**: ~62% base chance
- **Failure consequence**: Materials consumed, no output

### Crafting Cost
- Monetary fee required (percentage of output value)
- Fee scales with material tier
- Fee contributes to guild economy

### Luck Influence
- Player's "luck" perk improves success chance
- Each luck point adds +1% to success probability
- Maximum luck benefit capped at reasonable limit

### Craftable Materials

| Raw Material | Processed Output |
|--------------|------------------|
| Copper Ore | Copper Ingot |
| Iron Ore | Iron Ingot |
| Silver Ore | Silver Ingot |
| Gold Ore | Gold Ingot |

---

## Upgrade System

### Tool Upgrade Path
Tools follow linear progression:
```
Tier 1 → Tier 2 → Tier 3 → Tier 4
```

### Upgrade Requirements
Each upgrade requires:
1. **Money**: Scaling cost (e.g., 10K/20K/30K/40K)
2. **Materials**: Tier-appropriate crafting materials
3. **Base Tool**: Must possess tool being upgraded

### Upgrade Cost Tiers

| Upgrade | Money Cost | Material Required |
|---------|------------|-------------------|
| 1→2 | Low (10K) | Tier 2 wood (5 units) |
| 2→3 | Medium (20K) | Tier 2 ingot (5 units) |
| 3→4 | High (30K) | Tier 3 wood (5 units) |
| 4→5 | Very High (40K) | Tier 4 ore (5 units) |

### Upgrade Process
- Original tool consumed in process
- New tool granted with full durability
- Cannot upgrade if already own higher tier version
- One-way progression (no downgrades)

---

## Inventory Integration

### Equipment-Inventory Relationship
- Equipped items leave inventory and occupy equipment slots
- Unequipped items return to inventory
- Inventory weight/capacity constraints apply to unequipping

### Item Stacking Rules

#### Non-Stackable Items
- Weapons, armor, tools (durability-based items)
- Each unit occupies separate inventory slot
- Represented by durability value, not quantity

#### Stackable Items
- Materials, food, consumables
- Multiple units occupy single slot
- Represented by quantity count

### Equipment Weight
- All items have weight values
- Equipped items contribute to total weight
- Weight limits enforced by perk system

---

## Progression & Tracking

### Combat Records
- `wins`: Total combat victories
- `losses`: Total combat defeats
- Win/loss ratio calculable for rankings

### Character Advancement

#### Through Equipment
- Primary RPG progression method
- Better equipment = higher stats
- Equipment obtained through economy (purchase/crafting)

#### Through Perks (Economy Link)
- Economy perks (luck) affect RPG activities
- Crafting success, gathering yields improved
- Cross-system synergy

### Future Extension: Skill System
Design reserves support for skills:
- `skills[]`: Owned skills list
- `skill[]`: Equipped active skills
- Extensible for magic/abilities system

---

## Design Principles

1. **Equipment-Centric Progression**: Character power primarily comes from items, not levels
2. **Risk-Free Combat**: No item loss on defeat (encourages PvP)
3. **Economy-RPG Bridge**: Crafting/gathering connects both systems
4. **Tiered Content**: Clear progression path through 4+ tiers
5. **Simplicity**: Core stats limited to ATK/DEF/HP for clarity
6. **Extensibility**: Property system allows new stat types
7. **Visual Feedback**: HP bars, equipment displays, clear combat logs

---

## Re-implementation Guidelines

### Core Data Structures

#### Character Profile
```
{
  // Equipment slots
  weapon: item_id | "nothing",
  shield: item_id | "nothing",
  helmet: item_id | "nothing",
  chest: item_id | "nothing",
  pants: item_id | "nothing",
  boots: item_id | "nothing",
  ring: item_id | "nothing",
  necklace: item_id | "nothing",
  
  // Stats (calculated from equipment)
  hp: number,
  max_hp: number,
  atk: number,
  def: number,
  
  // State
  is_fighting: boolean,
  
  // Progression
  wins: number,
  losses: number,
  
  // Extension ready
  skills: [],
  skill_equipped: []
}
```

#### Item Definition
```
{
  name: string,
  type: "weapon" | "shield" | "helmet" | "chest" | "pants" | "boots" | "ring" | "necklace" | "tool" | ...,
  properties: {
    atk?: number,
    def?: number,
    hp?: number
  },
  durability?: number,  // For tools/non-stackables
  weight: number,
  value: number,
  tier?: number  // For upgrade paths
}
```

### Key Algorithms

#### Stat Recalculation
```
function calculateStats(equipment):
  stats = { atk: 0, def: 0, max_hp: 100 }
  for slot, item in equipment:
    if item exists:
      for stat, value in item.properties:
        stats[stat] += value
  return stats
```

#### Combat Turn Resolution
```
function resolveRound(player1, player2, move1, move2):
  // Calculate both damages simultaneously
  dmg1 = calculateDamage(player1, player2, move1)
  dmg2 = calculateDamage(player2, player1, move2)
  
  // Apply simultaneously
  player1.hp -= dmg2
  player2.hp -= dmg1
```

#### Damage Calculation
```
function calculateDamage(attacker, defender, move):
  if move == "Block":
    return 0  // Or minimal damage
  
  baseDamage = random(attacker.atk * 0.95, attacker.atk * 1.25)
  if move == "Critical":
    baseDamage = random(attacker.atk * 1.5, attacker.atk * 2.0)
  
  reduction = random(defender.def * 0.5, defender.def)
  return max(1, baseDamage - reduction)
```

---

## Integration Points

### Economy System Dependencies
- Account existence (RPG profile auto-creates)
- Inventory system (equipment management)
- Perk system (luck affects crafting/gathering)
- Currency (upgrades, crafting fees)
- Guild economy (taxes from crafting)

### Bot Command Interface
- Equipment commands: `equip`, `unequip`
- Info commands: `rpgprofile`, `stats`
- Combat commands: `fight` (when implemented)
- Gathering commands: `mine`, `cutdown`
- Crafting commands: `create`, `upgrade`

---

*This design document captures the conceptual framework of the DarkH RPG system. Implementation details may vary while preserving these core mechanics and relationships.*
