# Reactive UI System

The bot implements an internal UI framework located in `src/modules/ui`. This system allows building interactive interfaces (Embeds, Buttons, Selectors, and Modals) with reactive state management, similar to how modern web frameworks like React or SolidJS work, but adapted to Discord's message model.

## Key Concepts

### 1. Reactive State (Signals)

Instead of manually reconstructing messages every time a user interacts, the system uses **Signals**.

- A state object (`state`) is passed to the UI constructor.
- When a state property changes, the system detects the change and automatically "re-renders" the message (updates the embed or components).

### 2. The `UI` Class

The main container for any complex interaction.

- **Constructor**: Receives the initial state, a rendering function ("builder"), and a method to send the message.
- **Rendering**: The builder function receives the current state and must return the message structure (`embeds`, `components`). This function is pure: given the same state, it always returns the same display.

### 3. Sessions and Lifecycle

Every time an interactive UI is sent, a **Session** is created.

- **In-Memory Persistence**: Button and selector _handlers_ are stored in memory (`sessions.ts`).
- **TTL (Time To Live)**: Sessions have a limited lifetime. If the user does not interact for a while (e.g., 15 minutes), the session expires to free memory and buttons stop working (or show a friendly error).

## Interactive Components

The system decouples the button definition from its execution logic through deterministic or random IDs managed by the session.

- **Buttons (`Button`)**: Support direct callbacks `.onClick(...)`.
- **Selectors (`SelectMenu`)**: Typed for strings, users, roles, channels, etc.
- **Modals**: Can be invoked from buttons using `.opens(modal)`.

## Conceptual Example

```typescript
// 1. Initial State
const state = { count: 0 };

// 2. UI Definition
const counterUI = new UI(
  state,
  (state) => {
    // This function runs every time 'state.count' changes

    const btnAdd = new Button().setLabel("+1").onClick("add", () => {
      // Modifying state triggers an automatic update
      state.count++;
    });

    return {
      content: `The count is: ${state.count}`,
      components: [new ActionRow().addComponents(btnAdd)],
    };
  },
  (msg) => ctx.editOrReply(msg),
);

// 3. Start
await counterUI.send();
```

## Design Benefits

- **Declarative Code**: Describes _how the UI should look_ based on state, not _how to change it_ step-by-step.
- **Less Boilerplate**: No need to manually manage interaction collectors (`InteractionCollector`) or worry about filtering events.
- **Type Safety**: State is fully typed, avoiding common errors when passing data between interactions.
