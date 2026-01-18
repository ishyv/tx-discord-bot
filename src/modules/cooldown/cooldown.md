## Cooldown system

The cooldown system prevents spam by limiting how often a command can be used.

### Main pieces

- `CooldownManager` (`src/modules/cooldown/manager.ts`)
  - In-memory storage with monotonic timestamps.
  - Key format: `commandName:type:target`.
- `Cooldown` decorator (`src/modules/cooldown/index.ts`)
  - Adds a `cooldown` config to the command class.
- Middleware (`src/middlewares/cooldown.ts`)
  - Executes the check before commands run.

### Command config

Each command can define:

- `type`: `user`, `guild`, or `channel`
- `interval`: duration in milliseconds
- `uses`: allowed uses per interval (default: 1)

Example:

```ts
@Cooldown({
  type: CooldownType.User,
  interval: 10_000,
  uses: { default: 1 },
})
```

### Behavior

- On the first use, the cooldown starts and an expiration timestamp is saved.
- If another invocation happens before expiration, it is blocked.
- Expired entries are removed lazily on access (no background task).
