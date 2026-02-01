# Feature Presets (Phase 10b)

Sistema de presets de features para lanzamiento progresivo de la economía.

## Overview

Los presets permiten activar/desactivar grupos de features de economía de forma segura:

- **Soft Launch**: Features seguras solo (recomendado para inicio)
- **Full Launch**: Todas las features activadas
- **Minimal**: Solo economía core

## Presets Disponibles

### Soft Launch (`soft`)

Para lanzamientos iniciales seguros.

**Habilitado**:
- ✅ Daily/Work
- ✅ Store
- ✅ Quests
- ✅ Trivia
- ✅ Perks/Equipment
- ✅ Crafting
- ✅ Voting

**Deshabilitado**:
- ❌ Coinflip (gambling)
- ❌ Rob (mecánica de robo)

### Full Launch (`full`)

Todas las features activadas.

**Todo habilitado**:
- ✅ Coinflip
- ✅ Rob
- ✅ Todo lo de Soft

### Minimal (`minimal`)

Solo economía core.

**Habilitado**:
- ✅ Daily/Work
- ✅ Store

**Deshabilitado**:
- ❌ Todo lo demás

## Uso

### Aplicar Preset

```
/economy-config preset:soft
```

Muestra:
- Features que se habilitarán
- Features que se deshabilitarán
- Correlation ID para auditoría

### Ver Config Actual

```
/economy-config
```

Muestra:
- Preset inferido
- Estado de cada feature
- Presets disponibles

## Progresive Rollout

### Desbloqueo Secuencial

El sistema sugiere desbloquear features en orden:

1. **Coinflip** (después de 3 días + 20 tx/día)
2. **Rob** (después de 7 días + 30 tx/día)

### Criterios de Desbloqueo

| Feature | Días Mínimos | Transacciones/Día | Razón |
|---------|-------------|-------------------|-------|
| Coinflip | 3 | 20 | Comunidad activa, seguro activar gambling |
| Rob | 7 | 30 | Economía fuerte, listo para theft mechanics |

### Notificaciones

Cuando se cumplen los criterios:
- Se envía sugerencia al canal de ops
- Incluye días desde lanzamiento y actividad
- Sugiere comando para aplicar preset full

**Ejemplo**:
```
🚀 Progressive Rollout Suggestions
📅 Days since launch: 5
📊 Avg transactions/day: 25

Features ready to unlock:
✅ coinflip: Community is active, safe to enable gambling minigame
   Run `/economy-config preset:full` or enable individually.
```

## Audit Logging

Cambio de preset genera entradas de audit:

```typescript
{
  operationType: "config_update",
  source: "feature_preset_service",
  reason: "Applied feature preset \"soft\" to guild",
  metadata: {
    correlationId: "preset_1234567890_abc123",
    preset: "soft",
    previousFlags: { ... },
    newFlags: { ... },
    enabled: [],
    disabled: ["coinflip", "rob"],
    changeType: "preset_apply"
  }
}
```

Cada feature cambiado también tiene su propia entrada para granularidad.

## API

### Aplicar Preset

```typescript
import { featurePresetService } from "@/modules/ops";

const result = await featurePresetService.applyPreset(
  guildId,
  "soft",
  actorId
);

if (result.isOk()) {
  console.log("Enabled:", result.unwrap().enabled);
  console.log("Disabled:", result.unwrap().disabled);
  console.log("Correlation ID:", result.unwrap().correlationId);
}
```

### Ver Estado Actual

```typescript
const status = await featurePresetService.getCurrentStatus(guildId);
console.log("Preset:", status.unwrap().inferredPreset);
console.log("Flags:", status.unwrap().currentFlags);
```

### Verificar Desbloqueos

```typescript
const check = await featurePresetService.checkProgressiveUnlocks(guildId);

for (const suggestion of check.unwrap().suggestions) {
  if (suggestion.ready) {
    console.log(`${suggestion.feature} ready: ${suggestion.reason}`);
  }
}
```

## Metadata de Features

```typescript
interface FeatureFlagDef {
  name: "coinflip" | "trivia" | "rob" | "voting" | "crafting" | "store";
  description: string;
  riskLevel: "low" | "medium" | "high";
  category: "minigame" | "social" | "economy" | "inventory";
}
```

### Niveles de Riesgo

| Feature | Riesgo | Categoría |
|---------|--------|-----------|
| coinflip | high | minigame |
| rob | high | minigame |
| trivia | low | minigame |
| voting | low | social |
| crafting | low | inventory |
| store | low | economy |

## Transición de Lanzamiento

### Día 0: Soft Launch

```
/economy-config preset:soft
/ops soft_launch:true
```

### Día 3+: Sugerencia Coinflip

```
🚀 Progressive Rollout Suggestions
✅ coinflip ready to unlock
```

Opciones:
1. Esperar y aplicar full después
2. Aplicar preset:full ahora
3. Ignorar y mantener soft

### Día 7+: Sugerencia Rob

```
🚀 Progressive Rollout Suggestions
✅ rob ready to unlock
```

### Full Launch

```
/economy-config preset:full
/ops soft_launch:false
```

Mensaje:
> 🚀 **Full launch mode enabled!**
> All economy features are now active.

## Testing

```bash
bun test tests/unit-tests/feature-presets.unit.test.ts
```

Cobertura:
- Validación de presets
- Cálculo de diffs
- Criterios de desbloqueo
- Metadata de features
