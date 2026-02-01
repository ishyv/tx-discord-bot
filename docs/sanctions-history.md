# Sanctions History (Case System)

This document describes the operation, scope, and purpose of the sanctions history system (or "cases") implemented for moderation management.

## Purpose (Why?)

The case system arises from the need for a centralized and persistent record of disciplinary actions taken against a user **within a specific server**.

Unlike standard moderation commands (which execute the action but often leave no easily queryable record for the staff), the case system:

1.  **Provides Context**: Allows any moderator to quickly see if a user is a "repeat offender."
2.  **Unifies Criteria**: Groups sanctions of different types (Ban, Kick, Mute, Warn) under the same format.
3.  **Facilitates Auditing**: Provides a source of truth for appeals or report reviews.

## Scope

The system automatically records the following moderation actions:

- **BAN**: Permanent server bans.
- **KICK**: Server expulsions.
- **TIMEOUT**: Temporary mutes.
- **WARN**: Formal warnings.

> [!NOTE]
> The history is **per-guild**. This means that cases recorded in Server A will not be visible nor affect the user's reputation in Server B, respecting the privacy and autonomy of each community.

## Technical Operation (How?)

### 1. Data Structure

Cases are stored directly in the user document in the database (MongoDB) under the `sanction_history` field, which is an object indexed by the server ID.

```typescript
// In user.ts (Schema)
sanction_history: {
  "server_id": [
    {
      type: "BAN" | "KICK" | "TIMEOUT" | "WARN",
      description: "Reason for the sanction",
      date: "ISOString"
    }
  ]
}
```

### 2. Centralized Function: `registerCase`

To ensure that all commands record data in the same way, the `registerCase` function located in `src/db/repositories/users.ts` is used.

- **Responsibility**: Perform an atomic `$push` to the case array of the corresponding server.
- **Atomization**: Uses dot notation (`sanction_history.guildId`) to avoid bringing the entire document into memory, ensuring performance and consistency under concurrent writes.

### 3. Direct Integration

Moderation commands (`ban.ts`, `kick.ts`, `mute.ts`, and `warn add`) call `registerCase` immediately after the Discord action has been successfully completed.

### 4. Query via `/cases`

The `/cases [user]` command allows retrieving and viewing history:

- If a `user` is specified, it shows their cases in the current server.
- If not specified, the user can see their own history in that server.
- Shows the last 15 cases in reverse chronological order (most recent first).

## Maintainability

The system is designed following the **Repository Pattern** and validated by **Zod**, which means that adding a new sanction type or additional fields (e.g., moderator ID) requires minimal and centralized changes in the user schema and repository.
