# Economy Reports (Phase 9f)

Sistema de telemetría y reportes de balance para la economía del servidor.

## Overview

El sistema de reportes de economía proporciona a los administradores insights detallados sobre:

- Flujos de moneda (minted vs sunk)
- Fuentes principales de generación
- Sumideros principales de destrucción
- Distribución de riqueza (percentiles p50/p90/p99)
- Inflación neta por período
- Recomendaciones de balance basadas en heurísticas

## Uso

### Comando `/economy-report`

```
/economy-report [days: 1-30]
```

Genera un reporte completo con:
- Resumen de flujos de moneda
- Fuentes y sumideros principales
- Distribución de balances
- Recomendaciones de ajuste
- Checklist de "balance knobs"

### Permisos

- Requiere permiso `ManageGuild` (admin)

## Estructura del Reporte

### 1. Currency Flows (Flujos de Moneda)

```
💰 Currency Flows

coins
📈 Net: +50,000 (+12%)
├ Minted: 100,000
└ Sunk: 50,000
```

- **Net**: Inflación neta (minted - sunk)
- **Rate**: Porcentaje de inflación sobre total minted

### 2. Flow Breakdown (Desglose)

**Fuentes (Minting)**
- 🎁 Daily Rewards: 45,000 (45%)
- 💼 Work Rewards: 35,000 (35%)
- 📜 Quest Rewards: 20,000 (20%)

**Sumideros (Burning)**
- 🛒 Store Purchases: 30,000 (60%)
- 🔨 Crafting Costs: 15,000 (30%)
- ✨ Perk Purchases: 5,000 (10%)

### 3. Balance Distribution (Distribución)

```
coins (1,250 holders)
├ Median: 5,000 | Top 10%: 50,000
├ Top 1%: 200,000 | Max: 1,000,000
└ Wealth ratio (p99/p50): 40x
```

### 4. Recommendations (Recomendaciones)

El sistema genera recomendaciones automáticas basadas en umbrales:

| Tipo | Umbral | Severidad |
|------|--------|-----------|
| Inflación alta | > 20% semanal | warning/critical |
| Deflación | < -10% semanal | warning |
| Concentración de riqueza | p99/p50 > 100x | warning/critical |
| Baja actividad | < 10 transacciones/día | warning |
| Desbalance Work/Daily | ratio < 0.5 | info |

## Hybrid Work Payout Model (Phase 11.x)

El sistema de trabajo (`/work`) utiliza un modelo híbrido de pagos:

### Componentes del Pago

| Componente | Fuente | Inflacionario | Configuración |
|------------|--------|---------------|---------------|
| **Base Mint** | Se mintea nuevo | ✅ Sí | `workBaseMintReward` |
| **Bonus Treasury** | Sector `works` | ❌ No (redistribución) | `workBonusFromWorksMax` |

### Cómo funciona

1. **Base Mint**: Siempre se paga, independientemente del estado del tesoro
2. **Bonus**: Solo se paga si el sector `works` tiene fondos suficientes
3. **Escalado**: El bono puede ser "flat" o "percent" según `workBonusScaleMode`

### Configuración

```
/economy-config set-work-base-mint <amount>
/economy-config set-work-bonus-max <amount>
/economy-config set-work-bonus-mode <flat|percent>
```

### Impacto en Reportes

- El **baseMint** se cuenta como inflación (nueva moneda)
- El **bonusFromWorks** NO se cuenta como inflación (redistribución)
- Los metadatos de auditoría incluyen:
  - `baseMint`: monto base pagado
  - `bonusFromWorks`: monto del bono del tesoro
  - `isMinted`: true si hubo base mint
  - `isRedistribution`: true si hubo bono

## Balance Knobs Checklist

El reporte incluye una checklist de comandos para ajustar la economía:

### Daily/Work Rewards
```
/guild-economy
```
- Ajustar `dailyReward` y `workBaseMintReward`
- Reducir si hay inflación alta
- Aumentar si hay deflación
- Configurar `workBonusFromWorksMax` para incentivar fondos del sector works

### Tax & Fees
```
/guild-economy
```
- Configurar `transferTaxRate` y `dailyFeeRate`
- Habilitar para crear más sumideros
- Depositar en sector works

### Store Prices
```
/shop restock
```
- Ajustar precios de items
- Aumentar durante inflación
- Reducir durante deflación

### Events
```
/event-start
```
- Modificadores temporales
- Boost de rewards para engagement
- Bonus a actividades específicas

## Tipos de Recomendaciones

### Inflación
**Trigger**: Inflación > 20% en el período

**Acciones sugeridas**:
- Reducir daily/work rewards en `/guild-economy config`
- Aumentar precios en tienda o agregar más items sumidero
- Habilitar o aumentar tasas de transferencia

### Deflación
**Trigger**: Inflación < -10% en el período

**Acciones sugeridas**:
- Aumentar daily/work rewards
- Agregar más variedad de quest rewards
- Ejecutar evento con bonus rewards
- Reducir precios de tienda temporalmente

### Wealth Gap (Brecha de Riqueza)
**Trigger**: Ratio p99/p50 > 100x

**Acciones sugeridas**:
- Habilitar tax brackets progresivos
- Agregar items que beneficien nuevos jugadores
- Crear quests con mecánicas anti-whale
- Considerar wealth tax en balances altos

### Sector Imbalance (Desbalance de Sectores)
**Trigger**: Work/Daily ratio < 0.5

**Acciones sugeridas**:
- Aumentar work rewards o reducir cooldown
- Agregar quests relacionados con work
- Promover beneficios del comando work

### Low Activity (Baja Actividad)
**Trigger**: < 10 transacciones/día promedio

**Acciones sugeridas**:
- Promover comandos daily/work
- Agregar items atractivos a la tienda
- Crear eventos de tiempo limitado
- Revisar dificultad/rewards de quests

## API del Servicio

```typescript
import { economyReportService } from "@/modules/economy/reports";

// Generar reporte completo
const report = await economyReportService.generateReport({
  guildId: "123456789",
  days: 7,
});

// Quick stats para dashboards
const stats = await economyReportService.getQuickStats(guildId, 7);
```

### QuickStats

```typescript
interface QuickStats {
  days: number;
  totalMinted: number;
  totalSunk: number;
  netInflation: number;
  transactionCount: number;
  uniqueUsers: number;
}
```

## Implementación Técnica

### Rendimiento

- Usa índices MongoDB en `economy_audit` (guildId + timestamp)
- Agregaciones optimizadas para evitar full scans
- Cálculo de percentiles usando arrays ordenados (precisión vs velocidad)
- Límite de 10,000 entradas de audit por reporte

### Estructura de Archivos

```
src/modules/economy/reports/
├── types.ts      # Definiciones de tipos
├── service.ts    # EconomyReportService
└── index.ts      # Exports
```

### Tests

```bash
bun test tests/unit-tests/economy-report.unit.test.ts
```

Cobertura:
- Clasificación de operaciones (minting/sink/transfer)
- Cálculos de inflación
- Distribución de percentiles
- Generación de recomendaciones
- Ventanas de tiempo

## Integración con Otros Sistemas

### Audit System
El reporte consume datos del `economyAuditRepo`:
- Filtra por guildId y rango de fechas
- Usa índices predefinidos para rendimiento
- Soporta hasta 30 días de historial

### Guild Economy
Las recomendaciones sugieren ajustes a:
- `daily.dailyReward`
- `work.workRewardBase`
- `tax.transferTaxRate`
- `tax.dailyFeeRate`

### Store System
Recomendaciones afectan:
- Precios de items en rotación
- Stock de items sumidero
- Descuentos temporales

## Métricas Clave

| Métrica | Descripción | Target |
|---------|-------------|--------|
| Inflación semanal | (Minted - Sunk) / Minted | 0-10% |
| Wealth Ratio | p99 / p50 | < 50x |
| Transacciones/día | Total / días | > 20 |
| Work/Daily Ratio | Work amount / Daily amount | > 0.7 |
| Sinks/Minted | Total sunk / Total minted | > 40% |
