# Store Rotation (Phase 9d)

Featured item rotation system with daily slots and a legendary weekly slot.

## Overview

The store rotation system provides:
- **Daily Featured Items**: 5 items (configurable) with special discounts
- **Legendary Slot**: 1 special item with double discount
- **Pricing Modifiers**: Featured discount + scarcity markup when stock is low
- **Automatic Rotation**: Daily rotation based on configurable schedule

## Configuration

### Default Settings

```typescript
{
  mode: "auto",                    // "manual" | "auto" | "disabled"
  dailyFeaturedCount: 5,           // Number of daily featured items
  hasLegendarySlot: true,          // Enable legendary slot
  featuredDiscountPct: 0.15,       // 15% discount
  scarcityMarkupPct: 0.25,         // 25% markup when scarce
  scarcityThreshold: 10,           // Stock below this triggers markup
  rotationHours: 24,               // Rotation interval
  rotationOnAccess: true,          // Rotate on first access of the day
}
```

### Commands

```bash
# View current configuration
/economy-config store action:view

# Set daily featured count (1-10)
/economy-config store action:featured-count value:5

# Set discount percentage (0-1)
/economy-config store action:featured-discount numeric_value:0.15

# Set scarcity markup (0-2)
/economy-config store action:scarcity-markup numeric_value:0.25

# Set rotation mode
/economy-config store action:rotation-mode value:auto

# Toggle legendary slot
/economy-config store action:legendary-slot value:true

# Force immediate rotation
/economy-config store action:rotate-now
```

## Pricing

### Featured Price Calculation

```
featured_price = base_price * (1 - discount_pct)

if (stock < scarcity_threshold):
  featured_price *= (1 + scarcity_markup_pct)

featured_price = max(1, round(featured_price))
```

### Example Prices

| Base Price | Discount | Stock | Scarcity | Final Price | Savings |
|------------|----------|-------|----------|-------------|---------|
| 100 | 15% | 100 | No | 85 | 15 |
| 100 | 15% | 5 | Yes (25%) | 106 | -6 |
| 500 | 30% (legendary) | 50 | No | 350 | 150 |
| 1000 | 15% | 3 | Yes (25%) | 1063 | -63 |

## User Commands

```bash
# View featured items with discounts
/store-featured

# Regular store list (includes featured section)
/store-list

# Buy items at featured prices
/store-buy item:<id>
```

## Audit Metadata

Featured purchases include additional metadata:

```typescript
{
  isFeatured: true,
  featuredSlotType: "daily" | "legendary",
  originalPrice: number,
  featuredDiscountPct: number,
  scarcityMarkupPct: number,
  savings: number
}
```

## Implementation

### Files

- `src/modules/economy/store/rotation/types.ts` - Types and calculations
- `src/modules/economy/store/rotation/repository.ts` - Database persistence
- `src/modules/economy/store/rotation/service.ts` - Business logic
- `src/commands/economy/store.ts` - UI commands
- `src/commands/economy/economy-config/set-store.command.ts` - Admin config

### Rotation Algorithm

1. **Seeded Random**: Uses date-based seed for consistent daily rotation
2. **Fisher-Yates Shuffle**: Randomizes item selection
3. **Legendary Priority**: First slot gets double discount
4. **Auto-rotation**: Triggers on first store access after rotation time

### Key Features

- **Deterministic**: Same seed produces same rotation (per-day stability)
- **Atomic Updates**: Stock decrement is atomic to prevent overselling
- **Audit Trail**: All featured purchases tracked with metadata
- **Flexible Config**: All parameters adjustable via commands
