# Unique Items Specification Document

## Overview

Unique items represent the pinnacle of the trinket system - exceptionally rare and powerful items that can only be obtained through specific, hand-crafted conditions. Unlike standard items that follow predictable rarity tiers, Unique items are one-of-a-kind treasures with special acquisition methods.

---

## Core Principles

### 1. Exclusivity
- Each Unique item exists in limited quantities (typically 1-10 per server)
- Cannot be obtained through standard means (market, drops, crafting)
- Requires completion of specific, challenging conditions

### 2. Hand-Crafted Nature
- Created individually by game administrators
- Each has a unique backstory and lore
- Special visual effects or animations (if applicable)

### 3. Power Level
- Equal to or greater than Holy tier items
- May have unique mechanics not found in standard items
- Can break certain rules (e.g., slot restrictions)

---

## Acquisition Methods (Planned)

### Method 1: Legendary Quests
**Status:** Planned

- Multi-stage questlines requiring weeks to complete
- Involve all game systems (economy, RPG, social)
- Story-driven narrative with NPC interactions
- Example: "The Merchant's Odyssey" - A 10-part quest to earn the "Coin of Eternal Trade"

### Method 2: World Events
**Status:** Concept

- Server-wide events occurring once per season
- Competitive or cooperative challenges
- Limited-time opportunities
- Example: "The Great Market Crash" - Players must work together to stabilize the economy

### Method 3: Achievement Mastery
**Status:** Planned

- Awarded for reaching extreme milestones
- Requires dedication over months/years
- Recognizes exceptional player commitment
- Example: "Master of Coin" - Awarded after earning 1 billion total currency

### Method 4: Dungeon Drops (WIP)
**Status:** In Development

- High-level dungeon final bosses
- Very low drop rates (0.1% or less)
- Requires coordinated group effort
- Example: "Dimemorphin Belt" prototype testing

### Method 5: Admin Grant
**Status:** Active

- Direct creation by administrators
- For special recognition, events, or compensation
- Fully customizable stats and effects
- Example: "Founder's Medallion" - Given to beta testers

---

## Unique Item Framework (Technical)

### Data Structure
```typescript
interface UniqueItemDefinition extends EquipableItemDefinition {
  readonly rarity: "unique";
  readonly uniqueId: string;           // Unique identifier
  readonly acquisitionMethod: string;   // How it's obtained
  readonly lore: string;               // Extended backstory
  readonly creator: string;            // Who created it
  readonly createdAt: Date;            // When it was added
  readonly limitedQuantity?: number;    // Max copies allowed
  readonly currentOwners?: string[];    // Track who owns it
  readonly retired?: boolean;          // No longer obtainable
}
```

### Special Properties
- Can equip in any slot (slot-agnostic)
- May have multiple stat categories
- Can have active/passive abilities
- May affect game systems beyond economy

---

## Planned Unique Items

### 1. "Dimemorphin Belt" (Prototype)
**Tier:** Holy (transitioning to Unique)
**Current Status:** Testing as Holy tier
**Planned Unique Features:**
- True infinite slot expansion (no cap)
- Visual effect: Space distortion around player
- Lore: "Forged from the fabric of reality itself"

### 2. "Coin of Eternal Trade"
**Acquisition:** Legendary Quest "The Merchant's Odyssey"
**Slot:** Trinket (any)
**Stats:**
- +50% Shop Discount
- +25% Work Bonus
- Passive: All trades generate 1% bonus for both parties

### 3. "Chronos Heart"
**Acquisition:** World Event "Time Fracture"
**Slot:** Necklace
**Stats:**
- +10 Daily Streak Cap
- +20% Work Bonus
- Special: Once per day, redo any failed gamble

### 4. "The Dev's Favor"
**Acquisition:** Admin Grant only
**Slot:** Any
**Stats:**
- Customizable by admin
- May break game rules
- Visual: Golden aura effect

---

## Implementation Timeline

### Phase 1: Foundation (Current)
- [x] Implement rarity system (Common → Holy)
- [x] Create slot expansion mechanics
- [x] Test Dimemorphin Belt as Holy tier

### Phase 2: Unique Framework (Next)
- [ ] Create Unique item data structure
- [ ] Implement acquisition tracking
- [ ] Add admin creation tools
- [ ] Design first Legendary Quest

### Phase 3: Content (Future)
- [ ] Launch first Legendary Quest
- [ ] Create 3-5 initial Unique items
- [ ] Implement World Event system
- [ ] Add visual effects framework

### Phase 4: Polish
- [ ] Balance testing
- [ ] Lore integration
- [ ] Community feedback iteration

---

## Balance Considerations

### Power Creep Prevention
- Unique items should be sidegrades, not strict upgrades
- Focus on unique mechanics over raw stats
- Limited quantity prevents economy disruption

### Economic Impact
- Cannot be traded on standard market
- May have special trade restrictions
- Value determined by rarity and prestige

### Player Experience
- Clear communication about acquisition methods
- Progress tracking for long-term goals
- Recognition systems for Unique item owners

---

## Admin Tools Requirements

### Item Creation
```
/admin create-unique
  --name "Item Name"
  --slot <slot_type>
  --stats <json_stats>
  --lore "Backstory"
  --acquisition "How to obtain"
  --quantity <max_copies>
```

### Item Granting
```
/admin grant-unique
  --item <unique_id>
  --user <user_id>
  --reason "Why granting"
```

### Item Tracking
- View all Unique items and owners
- Track acquisition dates
- Monitor item circulation
- Retire items from circulation

---

## Open Questions

1. **Should Unique items be tradable?**
- All items are tradable. Including unique. 

2. **What happens when a player quits?**
- Item becomes lost forever. 

3. **Can Unique items be upgraded?**
   - No. Unique items are final and cannot be enhanced or modified.

4. **Visual representation?**
   - Special embed colors, icons, or animations to distinguish Unique items in inventory and market.

---

*Document Version: 1.0*
*Created: 2026-02-06*
*Status: Specification Phase*
