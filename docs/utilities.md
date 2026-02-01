# Global Utilities

`src/utils` contains cross-cutting tools that should be reused instead of re-implemented. This document catalogs the most important ones.

## Result Pattern (`result.ts`)

The project avoids using `try/catch` for business flow errors (e.g., "user with insufficient funds"). Instead, it uses a `Result<T, E>` type.

- **Usage**: `Result.ok(value)` or `Result.err(error)`.
- **Benefit**: Forces the consumer to explicitly handle the failure case.
- **Example**:
  ```typescript
  const result = await service.createOffer(...);
  if (result.isErr()) {
      return ctx.reply(`Error: ${result.error}`);
  }
  const offer = result.unwrap();
  ```

## Moderation Logging (`moderationLogger.ts`)

Centralizes sending embeds to configured log channels.

- **Methods**: `logModerationAction`, `logMessageEdit`, `logMessageDelete`.
- **Intelligence**: Automatically resolves the correct channel (e.g., `generalLogs`, `voiceLogs`) based on guild configuration. You don't need to pass the channel ID manually.

## Disk Cache (`cache.ts`)

A simple persistent cache system (JSON).

- **Usage**: Ideal for remembering non-critical states between restarts that don't deserve a full Mongo collection (e.g., image hashes already scanned by AutoMod).
- **API**: `get`, `set` with optional TTL.

## Time Management (`ms.ts`)

Utilities for parsing and formatting durations.

- `parseTime(string)`: Converts "1d 2h" into milliseconds.
- `futureDate(ms)`: Returns a safe future date.

## Warning Identifiers (`warnId.ts`)

Short and readable ID generator for warnings (e.g., `W-A1B2`).

- Designed to be easy for humans to type in appeal commands.

## Economy (`economy.ts`)

Currency formats and display.

- `formatCurrency(amount, currency)`: Returns a formatted string with the correct symbol and thousands separators.

## User Memory (`userMemory.ts`)

Ephemeral in-memory storage for conversation contexts (used in AI).

- Manages chat histories per user with automatic cleanup (LRU or TTL).
