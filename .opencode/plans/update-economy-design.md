# Plan: Update ECONOMY_DESIGN.md

## Current Status
The ECONOMY_DESIGN.md file is outdated and needs to be rewritten to match our actual implementation.

## Key Changes Made (That Need Documentation)

### 1. Trinkets System (Major Change)
**Old**: Economy equipment was confusing - shared names with RPG gear
**New**: Complete rebrand as "Trinkets" - magical jewelry with boons

**Documentation Needed**:
- 6 base slots: Primary Trinket, Secondary Trinket, Left Ring, Right Ring, Necklace, Belt
- 5 rarity tiers: Common (🟢), Uncommon (🔵), Rare (🟣), Holy (🟡), Unique (🔴)
- Slot expansion system with special items
- Boon types: Luck, Work Bonus, Shop Discount, Streak Bonus, Weight Capacity, Slot Capacity
- Clear separation from RPG combat gear

### 2. Leveling System Rework
**Old**: 12 levels, linear progression (3,850 XP max)
**New**: 10 levels, exponential progression (38,000 XP max)

**Documentation Needed**:
- Level 1-3: Common (Easy)
- Level 4-5: Uncommon (Moderate)
- Level 6-7: Rare (Hard)
- Level 8-10: Holy (Very Hard/Extreme)
- Difficulty walls at 5→6 (2,000 XP) and 7→8 (6,000 XP)

### 3. Item Renaming
**Old Names → New Names**:
- Copper Ring → Novice's Band
- Iron Band → Band of the Steady Hand
- Enchanted Band → Whispering Band
- Leather Cord → Cord of Burden
- Rope Belt → Sash of the Wanderer
- Worker's Tool Belt → Artisan's Sash
- Master's Belt → Dimemorphin Belt

### 4. Slot Expansion Mechanics
**New System**:
- Bottomless Pouch: +1 slot (Common, Belt slot)
- Crystal Orb: +1 slot (Uncommon)
- Chronos Timepiece: +2 slots (Rare)
- Dimemorphin Belt: Infinite slots (Holy, very rare)
- Validation prevents slot-expanding items in bonus slots (except Dimemorphin)

### 5. Rarity Visualization
**New UI Features**:
- Color-coded embeds matching rarity
- Emojis next to item names
- Level requirements clearly displayed
- Rarity tier names shown

## Sections to Update

1. **Item/Object System** - Add trinkets category
2. **New Section: Trinkets System** - Comprehensive documentation
3. **Experience & Leveling** - Update to 10-level exponential curve
4. **RPG Equipment System** - Clarify distinction from trinkets
5. **Work System** - Mention trinket bonuses
6. **Daily Rewards** - Mention trinket bonuses
7. **Gambling Features** - Mention luck bonuses from trinkets
8. **Design Principles** - Add new principles about visual clarity and separation
9. **Recent Changes** - Add changelog section

## Implementation

When plan mode is disabled, I will:
1. Rewrite the entire ECONOMY_DESIGN.md file
2. Update all outdated sections
3. Add the new Trinkets System section
4. Update leveling tables
5. Add recent changes changelog
6. Ensure all item names match current implementation
