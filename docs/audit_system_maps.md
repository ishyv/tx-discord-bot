# System Maps - pyebot

## 1. Component Graph

Visual representation of the high-level architecture and dependencies.

```mermaid
graph TD
    subgraph "External"
        Discord["Discord API"]
        Mongo[("MongoDB")]
    end

    subgraph "Gateway Layer"
        Seyfert["Seyfert Client (src/index.ts)"]
        Handlers["Handlers (src/events/handlers)"]
        Listeners["Listeners (src/events/listeners)"]
        Middlewares["Middlewares (src/middlewares)"]
    end

    subgraph "Logic Layer"
        Commands["Commands (src/commands)"]
        Services["Services (src/services)"]
        Modules["Modules (src/modules)"]
        Systems["Systems (src/systems)"]
    end

    subgraph "Data Layer"
        Repos["Repositories (src/db/repositories)"]
        Schemas["Schemas (src/db/schemas)"]
        Config["Config Store (src/configuration)"]
    end

    Discord <--> Seyfert
    Seyfert --> Middlewares
    Seyfert --> Handlers
    Handlers --> Listeners
    Listeners --> Services
    Middlewares --> Commands
    Commands --> Services
    Commands --> Modules
    Services --> Repos
    Modules --> Repos
    Repos --> Schemas
    Repos <--> Mongo
    Services --> Config
```

## 2. Critical Flows

### AI Interaction Flow (Happy Path)

```mermaid
sequenceDiagram
    participant U as User
    participant S as Seyfert/Listener
    participant AI_S as AI Service
    participant RL as AI Rate Limiter
    participant P as Provider (Gemini/OpenAI)

    U->>S: Message / Command
    S->>AI_S: processMessage / generateForGuild
    AI_S->>RL: consume(userId)
    alt is allowed
        RL-->>AI_S: OK
        AI_S->>P: generate
        P-->>AI_S: response text
        AI_S-->>S: AIResponse
        S-->>U: Reply
    else is blocked
        RL-->>AI_S: Blocked (Reset in Xs)
        AI_S-->>S: Error Message
        S-->>U: "Has alcanzado el límite..."
    end
```

### Economy Transaction (Optimistic Concurrency)

```mermaid
flowchart TD
    Start([Start Transaction]) --> GetUser[ensureUser: load current balance]
    GetUser --> Apply[engine.apply: calc next state locally]
    Apply --> Check{is valid?}
    Check -- No --> Fail([Error: Invalid TX])
    Check -- Yes --> CAS[replaceCurrencyIfMatch: find by ID AND current balance]
    CAS --> Match{Match found?}
    Match -- Yes --> Success([Success])
    Match -- No --> Retry{Attempt < 3?}
    Retry -- Yes --> GetUser
    Retry -- No --> Conflict([Error: Conflict])
```

## 3. State Machines & Invariants

### Ticket Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Opening: User creates ticket
    Opening --> Open: Channel created & Staff notified
    Open --> InProgress: Staff claims / responds
    InProgress --> Closing: Staff / User closes
    Closing --> Closed: History saved & Channel deleted
    Closed --> Opening: Re-open (if applicable)
```

### Domain Invariants

| System         | Invariant                                               | Enforcement Point                                   |
| :------------- | :------------------------------------------------------ | :-------------------------------------------------- |
| **Economy**    | Balance cannot be negative (unless allowed by currency) | `Currency.isValid(next)` in `engine.apply`          |
| **Economy**    | Transaction updates must be atomic                      | Optimistic retry loop in `currencyTransaction`      |
| **Reputation** | Reputation must be non-negative integer                 | `clampRep` helper in `repositories/users.ts`        |
| **Tickets**    | User cannot exceed max tickets limit                    | Atomic `$size` check in `addOpenTicketIfBelowLimit` |
| **AI**         | Requests must respect guild-configured rate limits      | `aiRateLimiter.consume` in `AI Service`             |
| **Data**       | All DB reads/writes must match Schema                   | `UserSchema.parse` in `repositories/users.ts`       |
