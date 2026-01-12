Events Next Demo

Purpose
- Provide a safe, opt-in demo of the proposed "no internal hooks" event model.
- Keep the current event system intact while testing the idea.

How Seyfert events work (important details)
- Client.start() calls Client.loadEvents(), reading compiled files from the
  events directory defined in `seyfert.config.*` (here: `dist/events`).
- Each event name maps to exactly ONE handler in `client.events.values`.
  If two files use the same event name, the last one wins.
- EventHandler.runEvent builds the hook payload and calls:
  `event.run(hook, client, shardId)`.

What this module does
- Installs a runtime wrapper over the existing MESSAGE_CREATE handler.
- Runs a tiny in-memory registry for demo listeners.
- Delegates to the original handler so existing listeners keep working.
- Restores the original handler when the demo ends.

Demo usage
- Run `/new-event` in a channel.
- Send a normal message in the same channel within 60s.
- The demo replies, proving the direct handler path works.
- Run `/new-event stop` to cancel.

Non-goals
- Does not replace or migrate the current hook/listener system.
- Does not persist anything; it is purely in-memory for testing.
