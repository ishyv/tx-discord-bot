# AGENTS.md - PyEBot

Guía de referencia para agentes de código que trabajen en PyEBot, el bot oficial de Discord de la comunidad Programadores y Estudiantes (PyE).

---

## Visión General del Proyecto

PyEBot es un bot de Discord de código abierto construido con TypeScript y el framework [Seyfert](https://seyfert.dev). Está diseñado para servir a la comunidad hispana más grande de programación y estudio en Discord.

### Características Principales

- Comandos de moderación completos (ban, kick, mute, warn, cases)
- Sistema de reputación automática basada en IA y análisis de conversaciones
- Sistema de tickets con soporte de transcripción
- Apelación de sanciones
- Logs de servidor (mensajes, reacciones, voz, invites, etc.)
- Starboard
- Sugerencias
- Sistema de economía e inventario
- **Tablón de Misiones (Quest Board 2.0)**: Misiones diarias/semanales con recompensas
- Auto-respuestas en foros basadas en IA
- Ejecución de código en varios lenguajes de programación
- Sistema de autoroles con reglas configurables

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Lenguaje | TypeScript 5.9+ (target: ESNext, module: CommonJS) |
| Runtime | Node.js |
| Package Manager | Bun 1.2.20 |
| Framework | Seyfert 3.2.5 (Discord bot framework) |
| Base de Datos | MongoDB (driver nativo) |
| Validación | Zod 4.x |
| AI Providers | Google GenAI (Gemini), OpenAI |
| OCR | PaddleOCR |
| Lint/Format | Biome 2.1.3 |
| Git Hooks | Lefthook |
| Changelog | git-cliff |

---

## Estructura del Proyecto

```
pyebot/
├── src/
│   ├── commands/          # Comandos de Discord organizados por feature
│   │   ├── ai/           # Configuración de IA (modelo, provider, rate limits)
│   │   ├── automod/      # Configuración de moderación automática
│   │   ├── economy/      # Comandos de economía (balance, deposit, withdraw)
│   │   ├── fun/          # Comandos de entretenimiento
│   │   ├── game/         # Inventario y gestión de items
│   │   ├── moderation/   # Comandos de moderación (ban, kick, warn, etc.)
│   │   │   ├── autorole/ # Gestión de autoroles
│   │   │   ├── channels/ # Configuración de canales
│   │   │   ├── forums/   # Configuración de foros
│   │   │   ├── rep/      # Sistema de reputación manual
│   │   │   ├── roles/    # Gestión de roles con límites
│   │   │   ├── tickets/  # Configuración de tickets
│   │   │   ├── tops/     # Sistema de estadísticas
│   │   │   └── warn/     # Sistema de advertencias
│   │   ├── offers/       # Sistema de ofertas de comunidad
│   │   └── utility/      # Comandos de utilidad
│   ├── components/        # Manejadores de componentes interactivos (botones, selects, modals)
│   ├── configuration/     # Configuración centralizada del bot
│   ├── constants/         # Constantes globales
│   ├── db/               # Capa de persistencia
│   │   ├── repositories/ # Repositorios (patrón repositorio)
│   │   ├── schemas/      # Esquemas Zod (fuente única de verdad)
│   │   ├── atomic-transition.ts
│   │   ├── mongo.ts      # Conexión MongoDB singleton
│   │   └── types.ts
│   ├── events/
│   │   ├── handlers/     # Puentes entre gateway y hooks
│   │   ├── hooks/        # Buses de eventos en memoria
│   │   └── listeners/    # Lógica de negocio en respuesta a eventos
│   ├── middlewares/      # Middlewares globales de Seyfert
│   ├── modules/          # Lógica reutilizable por dominio
│   │   ├── autorole/     # Motor de autoroles
│   │   ├── code-detection/
│   │   ├── cooldown/     # Sistema de rate limiting
│   │   ├── economy/      # Motor de economía
│   │   ├── features/     # Sistema de feature flags
│   │   ├── guild-channels/
│   │   ├── guild-roles/
│   │   ├── inventory/    # Sistema de inventario
│   │   ├── moderation/   # Servicio de moderación
│   │   ├── offers/       # Servicio de ofertas
│   │   ├── prefabs/      # Componentes UI reutilizables
│   │   ├── tickets/      # Servicio de tickets
│   │   └── ui/           # Sistema de UI reactiva
│   ├── services/         # Integraciones externas
│   │   ├── ai/           # Servicio de IA (Gemini, OpenAI)
│   │   └── ocr/          # Servicio de OCR
│   ├── systems/          # Orquestación de flujos complejos
│   │   ├── automod/      # Sistema de moderación automática
│   │   ├── tickets/      # Sistema de tickets
│   │   └── tops/         # Sistema de estadísticas
│   ├── types/            # Definiciones de tipos adicionales
│   ├── utils/            # Utilidades
│   └── index.ts          # Punto de entrada único
├── tests/
│   └── db-tests/         # Tests de integración de base de datos
├── docs/                 # Documentación técnica
├── scripts/              # Scripts de utilidad
├── dist/                 # Código compilado (output de tsc)
├── commands.json         # Cache de comandos de Seyfert
├── seyfert.config.mjs    # Configuración de Seyfert
├── biome.json            # Configuración de Biome
├── lefthook.yml          # Configuración de git hooks
├── cliff.toml            # Configuración de git-cliff
├── docker-compose.yml    # Servicios de desarrollo (MongoDB)
├── tsconfig.json         # Configuración de TypeScript
└── package.json
```

---

## Arquitectura y Convenciones

### Flujo de Eventos

1. **Handlers** (`src/events/handlers/`): Reciben eventos del gateway de Seyfert y los re-emiten a hooks tipados.
2. **Hooks** (`src/events/hooks/`): Buses en memoria que desacoplan el transporte del evento.
3. **Listeners** (`src/events/listeners/`): Implementan la lógica de negocio (logs, automod, reputación, etc.).

### Capas de Responsabilidad

| Capa | Responsabilidad | Ubicación |
|------|-----------------|-----------|
| Comandos/Componentes | Validación de entrada, interacción con usuario | `src/commands/`, `src/components/` |
| Módulos | Lógica reutilizable por dominio, agnóstica al transporte | `src/modules/*` |
| Sistemas | Orquestación de flujos complejos multi-módulo | `src/systems/*` |
| Servicios | Integraciones externas (IA, OCR) | `src/services/*` |
| Repositorios | Acceso a datos, validación Zod en bordes | `src/db/repositories/*` |

### Patrones Clave

- **Fuente única de verdad**: Esquemas Zod en `src/db/schemas/*.ts` definen tipos y validación.
- **Patrón Repositorio**: Todo acceso a datos pasa por repositorios; nunca uses el driver de MongoDB directamente.
- **Validación en bordes**: Validar al entrar (UI/Comandos) y al persistir (Repositorios/Zod).
- **Delegación de lógica**: Comandos son coordinadores; la inteligencia vive en módulos y sistemas.
- **Desacoplamiento**: Hooks permiten activar/desactivar funcionalidades sin afectar el núcleo.

### Path Aliases

```typescript
// Mapeo: "@/*" -> "src/*"
import { something } from "@/db/schemas/user";
import { util } from "@/utils/someUtil";
```

---

## Comandos de Desarrollo

### Instalación

```bash
# Instalar dependencias (requiere Bun)
bun install

# Instalar git hooks (obligatorio)
lefthook install
```

### Compilación y Ejecución

```bash
# Compilar TypeScript
bun run build

# Modo desarrollo (recompilación automática)
bun run dev

# Compilar y ejecutar
bun run start
```

### Lint y Formato

```bash
# Formatear código
bun run fmt

# Verificar formato
bun run fmt:check

# Ejecutar linter
bun run lint

# Arreglar problemas de lint
bun run lint:fix

# Verificación completa (lint + format)
bun run check

# Arreglar todo automáticamente
bun run check:fix
```

### Tests

```bash
# Ejecutar tests de integración de base de datos
bun run test-db
```

### Limpieza

```bash
# Eliminar dist y commands.json
bun run clean
```

---

## Variables de Entorno

Crear archivo `.env` en la raíz con las siguientes variables:

```env
# Obligatorias
TOKEN=DISCORD_BOT_TOKEN
CLIENT_ID=DISCORD_CLIENT_ID

# MongoDB
MONGO_URI=mongodb://localhost:27017
DB_NAME=pyebot

# Opcionales - IA
GEMINI_API_KEY=API_KEY
OPENAI_API_KEY=API_KEY

# Opcionales - OCR
OCR_ASSETS_DIR=assets/ocr
```

---

## Base de Datos

### Desarrollo Local

```bash
# Levantar MongoDB con Docker
docker-compose up -d
```

### Esquemas Principales

| Entidad | Archivo | Descripción |
|---------|---------|-------------|
| User | `src/db/schemas/user.ts` | Usuarios (reputación, warns, tickets, economía, inventario, misiones) |
| Guild | `src/db/schemas/guild.ts` | Configuración por servidor (canales, roles, features, IA) |
| Offers | `src/db/schemas/offers.ts` | Ofertas de comunidad |
| Tops | `src/db/schemas/tops.ts` | Estadísticas de actividad |
| Quest Templates | `src/modules/economy/quests/repository.ts` | Plantillas de misiones (MongoDB) |
| Quest Rotations | `src/modules/economy/quests/repository.ts` | Rotaciones diarias/semanales (MongoDB) |
| Quest Progress | `src/modules/economy/quests/repository.ts` | Progreso de usuarios por misión (MongoDB) |

### Features Disponibles (Guild)

Ver enum `Features` en `src/db/schemas/guild.ts`:
- `tickets`, `automod`, `autoroles`, `warns`, `roles`
- `reputation`, `reputationDetection`, `tops`, `suggest`, `economy`, `game`

---

## Sistema de Misiones (Quest Board 2.0)

### Arquitectura

Ubicación: `src/modules/economy/quests/`

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| Types | `types.ts` | Definiciones, constantes, errores |
| Repository | `repository.ts` | Acceso a datos (templates, rotations, progress) |
| Service | `service.ts` | Lógica de negocio, progreso, reclamos |
| Rotation | `rotation.ts` | Generación de rotaciones diarias/semanales |
| Hooks | `hooks.ts` | Integración con otros sistemas |
| UI | `ui.ts` | Builders de embeds y componentes |

### Tipos de Requisitos Soportados

- `do_command` - Usar comando N veces
- `spend_currency` - Gastar moneda
- `craft_recipe` - Craftear receta N veces
- `win_minigame` - Ganar minijuego N veces (coinflip, trivia)
- `vote_cast` - Emitir voto N veces (love/hate)

### Comandos

- `/quests [tab]` - Tablón interactivo
- `/quest view <id>` - Ver misión
- `/quest claim <id>` - Reclamar recompensas
- `/quest progress` - Progreso general
- `/quest list` - Listar misiones

### Integración

Para registrar progreso desde otros sistemas:

```typescript
import { trackCommandUsage, trackCrafting, trackMinigameWin, trackVoteCast } from "@/modules/economy/quests";

// En servicio de Work
await trackCommandUsage(userId, guildId, "work");

// En servicio de Crafting
await trackCrafting(userId, guildId, recipeId, quantity);

// En servicio de Minijuegos
await trackMinigameWin(userId, guildId, "coinflip");
```

Ver documentación completa en `docs/sistema-misiones.md`.

---

## Convenciones de Código

### Estilo

- **Formatter**: Biome con indentación de espacios
- **Quotes**: Dobles
- **Organize imports**: Habilitado automáticamente

### Commits

- Usar [Conventional Commits](https://www.conventionalcommits.org/)
- **NO usar emojis** en mensajes de commit
- Formatos válidos:
  - `git(merge)`
  - `fix: arreglar bug raro`
  - `feat(api): agregar endpoint nuevo`
- Tipos válidos: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`, `git`

### Comentarios de Documentación

Los archivos incluyen comentarios de propósito estandarizados:

```typescript
/**
 * Purpose: Breve descripción del propósito.
 * Context: Contexto de uso.
 * Dependencies: Dependencias principales.
 * Invariants: Invariantes que deben mantenerse.
 * Gotchas: Advertencias o consideraciones.
 */
```

---

## Sistema de IA

### Configuración

Cada guild puede configurar su proveedor y modelo de IA. Ver `src/services/ai/`.

### Proveedores Soportados

- **Gemini** (Google GenAI): Modelos como `gemini-1.5-flash`, `gemini-2.5-flash`
- **OpenAI**: Modelos como `gpt-4o`

### Extensibilidad

Para agregar un nuevo proveedor:
1. Crear adaptador en `src/services/ai/` que implemente interfaz `AIProvider`
2. Registrar en constantes del servicio
3. El orquestador lo detectará automáticamente

---

## Middlewares Globales

Orden de ejecución (definido en `src/index.ts`):

1. `featureToggle` - Verifica si la feature está habilitada para el guild
2. `moderationLimit` - Aplica límites de moderación por rol
3. `guard` - Guardias de permisos
4. `cooldown` - Rate limiting por comando

---

## Configuración de Seyfert

Ver `seyfert.config.mjs`:
- **Locations**: `dist/commands`, `dist/events`, `dist/components`
- **Intents**: Todas las gateway intents habilitadas

---

## Seguridad

- Nunca commitear el archivo `.env`
- Usar repositorios para acceso a datos; evitar queries directas a MongoDB
- Validar entrada con Zod en los bordes
- Los middlewares aplican políticas de seguridad globalmente

---

## Documentación Adicional

| Documento | Contenido |
|-----------|-----------|
| `docs/arquitectura.md` | Arquitectura del runtime y capas |
| `docs/database.md` | Capa de persistencia y repositorios |
| `docs/sistema-ia.md` | Sistema de inteligencia artificial |
| `docs/moderacion.md` | Sistema de moderación |
| `docs/economia-e-inventario.md` | Sistema de economía |
| `docs/sistema-misiones.md` | Sistema de misiones (Quest Board 2.0) |
| `docs/event-bus.md` | Sistema de eventos |
| `docs/sistema-ui-reactivo.md` | Sistema de UI |
| `docs/configuracion-servidores.md` | Configuración por servidor |

---

## Referencias

- [Seyfert Documentation](https://seyfert.dev)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Biome Documentation](https://biomejs.dev/)
- [Zod Documentation](https://zod.dev/)
