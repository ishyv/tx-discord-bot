# Bot Architecture

A snapshot of how the main runtime pieces are orchestrated. This guide aims to clarify _why_ certain patterns were chosen and where to find each responsibility, without repeating the code.

## Entry Points and Lifecycle

- `src/index.ts` is the single startup point: it loads UI augmentations, extends the Seyfert context with logging helpers, applies global middlewares, and ensures the database connection before initializing the client.
- Event **Handlers** act as a bridge between the Seyfert gateway and internal hooks. Their sole responsibility is to receive the event and re-emit it to typed hooks.
- **Hooks** (`src/events/hooks/*.ts`) are in-memory buses that allow decoupling the event transport from business logic.
- **Listeners** (`src/events/listeners/*.ts`) implement business rules in response to events (logs, automod, reputation, etc.), registering themselves in the corresponding hooks.

## Layers and Conventions

- **Commands and Components**: Live in `src/commands` and `src/components`. They are thin wrappers for input validation and user interaction (UI), delegating heavy logic to modules or systems.
- **Modules** (`src/modules/*`): Group logic reusable by domain (economy, autoroles, cooldowns, etc.). They are transport-agnostic (they don't know if they come from a command or a listener).
- **Systems** (`src/systems/*`): Orchestrate complex flows involving multiple modules and states (e.g., Tickets, TOPs). They can have their own ephemeral state or schedulers.
- **Services** (`src/services/*`): Integrate external dependencies or heavy services (AI in `src/services/ai`, OCR in `src/services/ocr`). They isolate I/O from the rest of the domain.

## Context and Middlewares

- The extended context at startup adds cross-cutting utilities like preconfigured loggers per guild.
- Global middlewares (`src/middlewares/*`) ensure that critical policies (cooldowns, moderation limits, feature flags) are applied consistently before reaching the command code.

## UI and Sessions

- The UI layer offers abstractions over Seyfert to build interactive components and stateful user sessions. The goal is to prevent commands from manually managing the complexity of buttons and selectors in long flows.

## Persistence and Data

- The border with the database is managed through **Repositories** (`src/db/repositories/*`). No other layer interacts directly with the database driver.
- Data shapes are defined by **Zod** schemas (`src/db/schemas/*`), which guarantee validation and safe types at runtime.

## General Philosophy

- **Logic Delegation**: Commands and listeners are coordinators; intelligence lives in modules and systems.
- **Decoupling**: The use of hooks allows enabling or disabling functionalities without affecting the bot's core.
- **Validation at the Edges**: Data is validated upon entry (UI/Commands) and upon persistence (Repositories/Zod), keeping the domain core clean and typed.
