# Launch Pack (Phase 10d)

Paquete de lanzamiento con evento "Launch Week" y questline de inicio para nuevos jugadores.

## Overview

El Launch Pack proporciona:

1. **Launch Week Event**: Evento de 7 días con bonus pre-configurados
2. **Starter Questline**: 10 misiones diseñadas para nuevos jugadores
3. **Comandos de conveniencia**: `/event-launch-week` para iniciar rápidamente

## Launch Week Event

### Modificadores Activos

| Modificador | Valor | Efecto |
|-------------|-------|--------|
| `xpMultiplier` | 1.2 | +20% XP en todas las actividades |
| `dailyRewardBonusPct` | 0.1 | +10% recompensas daily |
| `triviaRewardBonusPct` | 0.1 | +10% recompensas trivia |
| `storeDiscountPct` | 0.05 | -5% descuento en tienda |

### Comando

```
/event-launch-week
```

Inicia automáticamente el evento con la configuración preset:
- Nombre: "🚀 Launch Week"
- Duración: 7 días (168 horas)
- Modificadores: Como se muestra arriba

**Permisos**: ManageGuild (Admin)

### API

```typescript
import { LAUNCH_WEEK_EVENT, LAUNCH_WEEK_MODIFIERS } from "@/modules/economy/events";

// Usar preset completo
await eventService.startEvent(guildId, LAUNCH_WEEK_EVENT, moderatorId);

// Solo modificadores
const modifiers = LAUNCH_WEEK_MODIFIERS;
```

## Starter Questline

10 misiones diseñadas para completarse en 1-2 días.

### Lista de Misiones

| # | ID | Nombre | Dificultad | Requisitos | Recompensas |
|---|----|--------|------------|------------|-------------|
| 1 | `starter_first_steps` | 👣 First Steps | easy | Daily x1 | 100 coins, 50 XP, starter_backpack |
| 2 | `starter_work_ethic` | 💼 Work Ethic | easy | Work x1 | 150 coins, 75 XP |
| 3 | `starter_bank_visit` | 🏦 Bank Visit | easy | Deposit coins | 75 coins, 60 XP |
| 4 | `starter_shopper` | 🛍️ First Purchase | easy | Visit store | 100 coins, 50 XP, starter_potion x3 |
| 5 | `starter_trivia_novice` | 🧠 Trivia Novice | easy | Win trivia x1 | 200 coins, 100 XP |
| 6 | `starter_consistency` | 📅 Daily Habit | medium | Daily x2 | 250 coins, 125 XP, starter_ring |
| 7 | `starter_hard_worker` | ⚒️ Hard Worker | medium | Work x3 | 300 coins, 150 XP |
| 8 | `starter_crafter` | 🔨 Budding Crafter | medium | Craft x1 | 200 coins, 100 XP, starter_hammer |
| 9 | `starter_trivia_enthusiast` | 🎯 Trivia Enthusiast | medium | Win trivia x3 | 400 coins, 200 XP, starter_amulet |
| 10 | `starter_graduate` | 🎓 Starter Graduate | hard | Complete others | 1000 coins, 500 XP, starter_set, 5 tokens |

### Recompensas Totales

```typescript
import { getStarterQuestTotalRewards } from "@/modules/economy/events";

const rewards = getStarterQuestTotalRewards();
// {
//   totalCoins: ~3775,
//   totalXP: ~1410,
//   totalItems: {
//     starter_backpack: 1,
//     starter_potion: 3,
//     starter_ring: 1,
//     starter_hammer: 1,
//     starter_amulet: 1,
//     starter_set: 1
//   }
// }
```

### Diseño para Nuevos Jugadores

- **Días 1-2**: Fácil de completar
- **Tutoriales**: Primeras 3 misiones introducen comandos básicos
- **Progresión**: Misiones 4-8 expanden funcionalidades
- **Challenge**: Misiones 9-10 requieren compromiso

### Categorías de Misiones

| Categoría | Misiones | Propósito |
|-----------|----------|-----------|
| 📚 Tutorial | 1-3 | Aprender comandos básicos |
| 🔍 Exploration | 4-5 | Descubrir features |
| 📈 Progression | 6-8 | Actividades diarias |
| ⚔️ Challenge | 9 | Habilidad en trivia |
| 🏆 Completion | 10 | Recompensa final |

## Integración con Quest Board

### Mostrar Starter Quests

Las misiones starter aparecen en el Quest Board:

```
/quests tab:starter
```

Durante Launch Week, se muestran prominentemente:
- Badge especial "🆕 New Player"
- Progreso visual destacado
- Recompensas aumentadas (si aplica)

### API

```typescript
import { STARTER_QUESTLINE, isLaunchWeekEvent } from "@/modules/economy/events";

// Obtener questline
const quests = STARTER_QUESTLINE;

// Verificar si evento activo es Launch Week
const isLaunch = isLaunchWeekEvent(activeEvent?.name);
```

## Flujo de Lanzamiento

### Paso 1: Preparar Servidor

```
/economy-config preset:soft
/ops soft_launch:true
```

### Paso 2: Iniciar Launch Week

```
/event-launch-week
```

### Paso 3: Anunciar

Mensaje automático:
> 🚀 **Launch Week Started!**
> The economy system is now live!
> New players can complete the **Starter Questline** for bonus rewards!

### Paso 4: Monitorear

```
/ops status
/economy-report days:7
```

### Paso 5: Full Launch (después de 1 semana)

```
/event-stop
/economy-config preset:full
/ops soft_launch:false
```

## Tests

```bash
bun test tests/unit-tests/launch-pack.unit.test.ts
```

Cobertura:
- Modificadores de Launch Week
- Estructura de starter quests
- Cálculo de recompensas totales
- Funciones utilitarias
