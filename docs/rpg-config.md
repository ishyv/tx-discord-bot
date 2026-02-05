# RPG Configuration

Guild-specific configuration for the RPG system.

## Overview

The RPG configuration allows server administrators to customize various aspects of the RPG system including combat mechanics, material processing rates, gathering yields, and tool upgrade costs.

## Configuration Structure

```typescript
interface RpgConfig {
  enabled: boolean;                    // Master toggle for RPG system
  combat: RpgCombatConfig;             // Combat mechanics
  processing: RpgProcessingConfig;     // Material processing
  gathering: RpgGatheringConfig;       // Resource gathering
  upgrades: RpgUpgradeConfig;          // Tool upgrades
  updatedAt: Date;                     // Last update timestamp
}
```

## Default Values

### Combat Configuration

| Key | Default | Range | Description |
|-----|---------|-------|-------------|
| `critChance` | 0.15 | 0.0 - 1.0 | Critical hit chance (15%) |
| `blockChance` | 0.25 | 0.0 - 1.0 | Block chance (25%) |
| `varianceMin` | 0.85 | 0.0 - 1.0 | Minimum damage variance (85%) |
| `varianceMax` | 1.15 | 0.0 - 1.0 | Maximum damage variance (115%) |
| `defenseReductionMin` | 0.1 | 0.0 - 1.0 | Minimum defense reduction (10%) |
| `defenseReductionMax` | 0.5 | 0.0 - 1.0 | Maximum defense reduction (50%) |
| `timeoutSeconds` | 300 | >= 30 | Combat timeout in seconds |

### Processing Configuration

| Key | Default | Range | Description |
|-----|---------|-------|-------------|
| `baseSuccessChance` | 0.6 | 0.0 - 1.0 | Base success chance (60%) |
| `luckCap` | 0.25 | 0.0 - 1.0 | Maximum luck bonus (25%) |
| `feePercent` | 0.05 | 0.0 - 1.0 | Processing fee percentage (5%) |
| `minFee` | 5 | >= 0 | Minimum processing fee |
| `maxFee` | 100 | >= 0 | Maximum processing fee |

### Gathering Configuration

| Key | Default | Range | Description |
|-----|---------|-------|-------------|
| `durabilityMin` | 8 | >= 1 | Minimum durability consumed per action |
| `durabilityMax` | 12 | >= 1 | Maximum durability consumed per action |
| `yieldMin` | 1 | >= 1 | Minimum materials per action |
| `yieldMax` | 3 | >= 1 | Maximum materials per action |
| `tierBonusPerLevel` | 0.5 | >= 0 | Bonus yield per tool tier level |

### Upgrade Configuration

| Key | Default | Range | Description |
|-----|---------|-------|-------------|
| `costs` | See below | - | Cost table by tier |
| `maxTier` | 4 | 1 - 10 | Maximum tool tier |
| `resetDurabilityOnUpgrade` | true | boolean | Reset durability after upgrade |

#### Default Upgrade Costs

| Tier | Money | Materials |
|------|-------|-----------|
| Tier 2 | 500 | 5x Iron Ore |
| Tier 3 | 2000 | 5x Silver Ore |
| Tier 4 | 10000 | 5x Gold Ore |

## Usage

### Getting Configuration

```typescript
import { rpgConfigRepo } from "@/modules/rpg/config";

// Get or create default config
const config = await rpgConfigRepo.ensure(guildId);

// Get without creating
const config = await rpgConfigRepo.get(guildId);
```

### Updating Configuration

```typescript
import { rpgConfigService } from "@/modules/rpg/config";

// Update combat config with audit logging
await rpgConfigService.updateCombatConfig(
  guildId,
  actorId,
  { critChance: 0.25, blockChance: 0.35 },
  { reason: "Balancing update", correlationId: "abc123" }
);

// Update processing config
await rpgConfigService.updateProcessingConfig(
  guildId,
  actorId,
  { baseSuccessChance: 0.75, feePercent: 0.1 }
);

// Update gathering config
await rpgConfigService.updateGatheringConfig(
  guildId,
  actorId,
  { durabilityMin: 5, durabilityMax: 15, yieldMax: 5 }
);

// Update upgrade config
await rpgConfigService.updateUpgradeConfig(
  guildId,
  actorId,
  { maxTier: 5, costs: { tier2: { money: 1000, materials: [...] } } }
);

// Enable/disable RPG
await rpgConfigService.setEnabled(guildId, actorId, false);
```

### Direct Repository Updates (without audit)

```typescript
import { rpgConfigRepo } from "@/modules/rpg/config";

await rpgConfigRepo.updateCombatConfig(guildId, { critChance: 0.2 });
await rpgConfigRepo.updateProcessingConfig(guildId, { baseSuccessChance: 0.7 });
await rpgConfigRepo.updateGatheringConfig(guildId, { yieldMax: 4 });
await rpgConfigRepo.updateUpgradeConfig(guildId, { maxTier: 5 });
await rpgConfigRepo.setEnabled(guildId, true);
```

## Audit Logging

All configuration changes made through `rpgConfigService` are automatically audited with:

- `operationType`: "config_update"
- `category`: "combat" | "processing" | "gathering" | "upgrades" | "enabled"
- `field`: The specific field changed
- `before`: Previous value
- `after`: New value
- `correlationId`: Optional trace ID

## Database Schema

The RPG configuration is stored as a subdocument in the guild document:

```javascript
{
  _id: "guild_id",
  rpg: {
    enabled: true,
    combat: { ... },
    processing: { ... },
    gathering: { ... },
    upgrades: { ... },
    updatedAt: ISODate()
  }
}
```

## TypeScript Types

```typescript
import type {
  RpgConfig,
  RpgCombatConfig,
  RpgProcessingConfig,
  RpgGatheringConfig,
  RpgUpgradeConfig,
  UpgradeCost,
  UpgradeMaterial,
} from "@/modules/rpg/config";
```

## Error Handling

All repository methods return `Result<T, Error>`. Common error cases:

- Config not found (use `ensure` to create defaults)
- Invalid value ranges (automatically clamped to valid ranges)
- Database errors

## See Also

- [RPG System Overview](./rpg-overview.md)
- [Combat System](./combat.md)
- [Gathering System](./gathering.md)
- [Processing System](./processing.md)
- [Upgrade System](./upgrades.md)
