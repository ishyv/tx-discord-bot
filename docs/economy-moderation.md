# Economy Moderation (Phase 10c)

Herramientas de moderación para triage de economía.

## Overview

Comandos de moderación para gestionar cuentas de economía:

- **Freeze**: Bloquear cuenta temporal o permanentemente
- **Unfreeze**: Desbloquear cuenta
- **Peek**: Ver datos de usuario para revisión
- **Audit**: Consultar logs con filtros

## Comandos

### `/economy-freeze @user [hours] [reason]`

Bloquea la cuenta de economía de un usuario.

**Parámetros:**
- `@user`: Usuario a bloquear (requerido)
- `hours`: Duración en horas (opcional, omitir para indefinido)
- `reason`: Razón del bloqueo (requerido)

**Permisos:** KickMembers o ManageGuild

**Ejemplos:**
```
/economy-freeze @spammer hours:24 reason:"Spam de comandos"
/economy-freeze @cheater reason:"Uso de exploits"
```

**Límites:**
- Máximo: 720 horas (30 días)
- Mínimo: 1 hora
- Indefinido: Sin parámetro hours (status = banned)
- No puedes freezearte a ti mismo

### `/economy-unfreeze @user [reason]`

Desbloquea la cuenta de economía de un usuario.

**Parámetros:**
- `@user`: Usuario a desbloquear (requerido)
- `reason`: Razón del desbloqueo (opcional)

**Ejemplos:**
```
/economy-unfreeze @spammer reason:"Cumplió sanción"
```

### `/economy-peek @user`

Muestra datos de economía de un usuario para revisión moderativa.

**Información mostrada:**
- Estado de cuenta (activa/frozen)
- Balances de monedas
- Flags (opt-out, cooldowns, etc.)
- Última actividad
- Últimas operaciones de audit (10)

**Privacidad:**
- No muestra notas de moderación privadas
- Solo datos de economía y actividad pública

### `/economy-audit [filters]`

Consulta logs de auditoría de economía.

**Filtros:**
- `target`: Filtrar por usuario objetivo
- `since_days`: Días hacia atrás (1-30)
- `limit`: Máximo resultados (1-100, default: 10)
- `correlation`: Filtrar por correlation ID

**Ejemplos:**
```
/economy-audit target:@user since_days:7 limit:25
/economy-audit correlation:preset_soft_1234567890
```

**Requisitos:** Al menos un filtro requerido

## Estados de Cuenta

| Estado | Descripción | Uso |
|--------|-------------|-----|
| `ok` | ✅ Activa | Estado normal |
| `blocked` | ⛔ Bloqueada temporal | Freeze con duración |
| `banned` | 🚫 Suspendida | Freeze indefinido |

## Almacenamiento

Los freezes se guardan en colección `economy_freezes`:

```typescript
interface EconomyFreeze {
  userId: string;
  status: "blocked" | "banned";
  reason: string;
  frozenAt: Date;
  expiresAt: Date | null;
  frozenBy: string;
  correlationId: string;
}
```

## Audit Logging

Todas las acciones de moderación generan entradas de audit:

### Freeze
```typescript
{
  operationType: "currency_adjust",
  source: "economy_moderation",
  reason: "Account frozen: [reason]",
  metadata: {
    correlationId: "mod_freeze_123...",
    action: "freeze",
    previousStatus: "ok",
    newStatus: "blocked",
    hours: 24,
    expiresAt: "2026-01-16T10:00:00Z"
  }
}
```

### Unfreeze
```typescript
{
  operationType: "currency_adjust",
  source: "economy_moderation",
  reason: "Account unfrozen: [reason]",
  metadata: {
    correlationId: "mod_unfreeze_456...",
    action: "unfreeze",
    previousStatus: "blocked",
    newStatus: "ok"
  }
}
```

## API del Servicio

```typescript
import { economyModerationService } from "@/modules/economy/moderation";

// Freeze cuenta
const freeze = await economyModerationService.freeze({
  userId: "user123",
  hours: 24, // null para indefinido
  reason: "Spam",
  moderatorId: "mod456",
  guildId: "guild789",
});

// Unfreeze cuenta
const unfreeze = await economyModerationService.unfreeze({
  userId: "user123",
  reason: "Cumplió sanción",
  moderatorId: "mod456",
});

// Check si está frozen
const status = await economyModerationService.isFrozen("user123");
console.log(status.unwrap().frozen);

// Peek datos
const peek = await economyModerationService.peek("user123");
console.log(peek.unwrap().balances);

// Query audit
const audit = await economyModerationService.queryAudit({
  targetId: "user123",
  sinceDays: 7,
  limit: 25,
});
```

## Limpieza Automática

Los registros de freeze expirados se pueden limpiar:

```typescript
import { economyModerationRepo } from "@/modules/economy/moderation";

// Listar freezes expirados
const expired = await economyModerationRepo.listExpiredFreezes();

// Limpiar todos los expirados
const deleted = await economyModerationRepo.cleanupExpired();
console.log(`Deleted ${deleted.unwrap()} expired freezes`);
```

## Flujo de Uso

### Caso 1: Spam de Comandos

1. Mod detecta spam de `/daily`
2. Ejecuta: `/economy-freeze @spammer hours:24 reason:"Spam de comandos"`
3. Usuario intenta `/daily` → Rechazado (cuenta frozen)
4. Después de 24h, cuenta se descongela automáticamente
5. O mod ejecuta: `/economy-unfreeze @spammer reason:"Cumplió sanción"`

### Caso 2: Uso de Exploits

1. Mod detecta uso de exploit
2. Ejecuta: `/economy-freeze @cheater reason:"Uso de exploits"` (sin hours = indefinido)
3. Investiga con: `/economy-peek @cheater` y `/economy-audit target:@cheater since_days:7`
4. Después de investigación: `/economy-unfreeze @cheater reason:"Investigación completada"`

## Seguridad

- **No auto-unfreeze**: Los moderadores deben decidir cuándo desbloquear
- **Audit trail completo**: Cada acción logueada con correlation ID
- **Sin fugas**: Moderation notes no expuestas en comandos
- **Validación**: No puedes freezearte a ti mismo
- **Límites**: Máximo 30 días, razón requerida

## Tests

```bash
bun test tests/unit-tests/economy-moderation.unit.test.ts
```

Cobertura:
- Cálculo de estado frozen
- Cálculo de horas restantes
- Formato de duración
- Constantes de límites
