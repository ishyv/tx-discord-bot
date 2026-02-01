# Launch Ops (Phase 10a)

Sistema de operaciones de lanzamiento para la economía - asegura un arranque seguro con assertions, configuración de ops y reportes programados.

## Overview

Launch Ops proporciona:

1. **Startup Assertions**: Verificación temprana de infraestructura crítica
2. **Ops Config**: Configuración guild-scoped para operaciones
3. **Scheduled Reports**: Reportes diarios automáticos de economía
4. **Kill Switches**: Switches de emergencia para features de alto riesgo

## Setup Inicial

### 1. Configurar Canal de Ops

```
/ops set-channel #economy-ops
```

### 2. Habilitar Reportes Diarios

```
/ops reports enable hour:9 days:7
```

### 3. Verificar Estado

```
/ops status
```

### 4. Modo Soft Launch (Opcional)

```
/ops soft-launch on
```

Habilita modo de prueba con features limitados antes del lanzamiento completo.

## Comandos

### `/ops` (default)
Muestra la configuración actual de ops.

### `/ops set-channel <channel>`
Configura el canal para reportes y alertas.

### `/ops economy <enable/disable>`
Habilita/deshabilita operaciones de economía.

### `/ops reports <options>`
Configura reportes diarios:
- `enabled`: Activar/desactivar
- `hour`: Hora del reporte (0-23)
- `days`: Ventana de días (1-30)

### `/ops set-hour <hour>`
Cambia solo la hora del reporte.

### `/ops soft-launch <on/off>`
Activa/desactiva modo soft launch.

### `/ops status`
Muestra estado del sistema de ops.

### `/ops test-report`
Genera un reporte de prueba manualmente.

## Configuración

### GuildOpsConfig

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `economyOpsEnabled` | boolean | true | Ops habilitadas |
| `opsChannelId` | string? | null | Canal para reportes |
| `dailyReportEnabled` | boolean | false | Reportes diarios activos |
| `dailyReportHourLocal` | number | 9 | Hora del reporte (0-23) |
| `reportWindowDays` | number | 7 | Días en reporte (1-30) |
| `softLaunchMode` | boolean | true | Modo de prueba |

### Startup Assertions

Verifica automáticamente al iniciar:

#### Indexes Críticos
- `economy_audit.guild_time_idx`
- `daily_claims.user_guild_claimedAt_idx`
- `work_claims.user_guild_claimedAt_idx`
- `votes.voter_target_guild_idx`
- `minigame_state.user_guild_game_idx`
- `quest_progress.user_guild_template_idx`
- `store_stock.guild_item_idx`

#### Config Bounds
| Config | Min | Max |
|--------|-----|-----|
| Tax Rate | 0 | 0.5 (50%) |
| Fee Rate | 0 | 0.2 (20%) |
| Daily Cooldown | 1h | 168h (1 semana) |
| Work Cooldown | 1m | 1440m (24h) |
| Daily Cap | 1 | 100 |

#### Currency IDs Canónicos
- `coins`
- `tokens`
- `rep`

### Kill Switches

Features que pueden desactivarse en runtime:

| Switch | Default | Descripción |
|--------|---------|-------------|
| `coinflip` | true | Minijuego coinflip |
| `trivia` | true | Minijuego trivia |
| `rob` | true | Minijuego rob |
| `voting` | true | Sistema love/hate |
| `crafting` | true | Crafting de items |
| `store` | true | Tienda de items |
| `economy_ops` | true | Operaciones y reportes |

## Scheduled Reports

### Lógica de Scheduling

- **Frecuencia**: Cada 15 minutos (check)
- **Hora**: Configurable por guild (hora local)
- **Deduplicación**: Máximo un reporte por día
- **Tolerancia**: 5 minutos (previene duplicados por restart)

### Formato del Reporte

```
📊 Economy Report: Last 7 Days

Currency Flows:
📈 coins: +50,000 (+12%)
📉 tokens: -100 (-5%)

⚠️ Top Recommendation
High inflation detected: +25% over 7 days
```

### Flags Automáticas

El reporte incluye flags si detecta:
- 📈 **Inflation Alert**: Inflación > 20%
- 📉 **Deflation Warning**: Deflación < -10%
- ⚠️ **Wealth Gap**: Concentración p99/p50 > 100x

## Soft Launch Mode

### Propósito

Permite probar la economía con features limitados antes del lanzamiento completo.

### Features en Soft Launch

**Deshabilitadas**:
- Coinflip
- Rob

**Habilitadas**:
- Daily/Work
- Store (compras limitadas)
- Quests
- Trivia

### Transición a Full Launch

```
/ops soft-launch off
```

Mensaje de confirmación:
> 🚀 **Full launch mode enabled!**
> All economy features are now active.

## API del Servicio

```typescript
import { launchOps, opsConfigRepo } from "@/modules/ops";

// Inicializar (llamar al startup)
const result = await launchOps.initialize();

// Obtener config
const config = await launchOps.getConfig(guildId);

// Actualizar config
await launchOps.updateConfig(guildId, {
  dailyReportEnabled: true,
  dailyReportHourLocal: 10,
});

// Ejecutar reporte manual
const report = await launchOps.triggerReport(guildId);

// Ver salud del sistema
const health = await launchOps.getHealth();
```

## Health Status

```typescript
interface OpsHealthStatus {
  assertionsPassed: number;
  assertionsFailed: number;
  configsValidated: number;
  configsWithErrors: number;
  scheduledReportsActive: number;
  lastCheckAt: Date;
  overallStatus: "healthy" | "degraded" | "critical";
}
```

### Estados

| Estado | Condición |
|--------|-----------|
| 🟢 **healthy** | Todas las assertions pasaron |
| 🟡 **degraded** | Algunas assertions fallaron (no críticas) |
| 🔴 **critical** | Assertion crítica falló |

## Troubleshooting

### "No ops channel set"
Configura un canal con `/ops set-channel #canal`

### "Economy ops disabled"
Habilita con `/ops economy enable`

### Reportes no se envían
1. Verificar canal configurado: `/ops`
2. Verificar reportes habilitados: `/ops reports enable`
3. Probar manualmente: `/ops test-report`

### Assertions fallan al startup
Revisar logs para ver cuál index/config falló. Las fallas críticas previenen el inicio.

## Testing

```bash
bun test tests/unit-tests/launch-ops.unit.test.ts
```

Tests cubren:
- Validación de bounds
- Cálculo de scheduling
- Prevención de duplicados
- Modo soft launch
