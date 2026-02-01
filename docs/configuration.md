# Configuration System (BindConfig)

This document describes the architecture and use of the `BindConfig` system, designed to centralize, validate, and type the configuration of all bot modules.

## Motivation

The system resolves configuration dispersion through:

- **Centralization**: All configuration definitions are registered in a single registry.
- **Strong Validation**: Use of **Zod** to ensure data complies with the expected contract.
- **Data Abstraction**: Commands do not interact with MongoDB; they use a high-level API that manages persistence and caching.

## System Components

1. **Definitions (`defineConfig`)**: Each module defines its schema (Zod) and its logical storage path via `defineConfig`.
2. **Central Registry**: Configurations are explicitly registered, allowing the system to resolve paths and apply types automatically.
3. **Store (`configStore`)**: The public interface for the rest of the bot.
   - `get(guildId, module)`: Retrieves the configuration, applies default values, and validates the data. Includes a caching layer to optimize performance.
   - `set(guildId, module, partial)`: Validates the partial change and persists it safely in the database.
4. **Provider**: The adapter responsible for translating logical requests into physical operations in the server document (MongoDB).

## Usage Guide

### 1. Define the Configuration

Create a configuration file in your module (e.g., `config.ts`) using `defineConfig`.

```typescript
export const myModuleConfig = defineConfig(
  ConfigurableModule.MyModule,
  z.object({
    enabled: z.boolean().default(true),
    limit: z.number().default(50),
  }),
);
```

### 2. Read Configuration

```typescript
const config = await configStore.get(guildId, ConfigurableModule.MyModule);
if (config.enabled) {
  // ... logic
}
```

### 3. Modify Configuration

```typescript
await configStore.set(guildId, ConfigurableModule.MyModule, { limit: 100 });
```

## Benefits

- **Automatic Typing**: Thanks to TypeScript and Zod, code consuming the configuration has immediate autocomplete and type validation.
- **Integrity**: It is impossible to persist data that does not comply with the defined schema.
- **Performance**: Integrated caching drastically reduces database queries for static or frequently read configurations.
