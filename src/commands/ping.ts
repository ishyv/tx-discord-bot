/**
 * Motivation: register the "ping" command within the ping category to provide the action in a consistent and reusable way.
 *
 * Idea/concept: uses Seyfert's command framework with typed options and shared utilities to validate input and dispatch logic.
 *
 * Scope: handles command invocation and response; delegates business rules, persistence, and additional policies to specialized services or modules.
 */
import type { CommandContext } from "seyfert";
import { Command, Declare } from "seyfert";

@Declare({
  name: "ping",
  description: "Show latency with Discord",
})
export default class PingCommand extends Command {
  async run(ctx: CommandContext) {
    const ping = ctx.client.gateway.latency;

    await ctx.write({
      content: `Latency is \`${ping}ms\``,
    });
  }
}
