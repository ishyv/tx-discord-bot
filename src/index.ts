/**
 * Purpose: Bot entrypoint that wires services, context extensions, and middleware.
 * Context: This is the only place that bootstraps the Seyfert client and starts it.
 * Dependencies: module-alias, dotenv, seyfert, Mongo (getDb), local middlewares.
 * Invariants:
 * - `seyfert-augmentations` must load before any Seyfert usage.
 * - Middlewares registered here are global and run for every command.
 * - Mongo connection is initialized once at startup.
 * Gotchas:
 * - Changing middleware order changes validation/permission behavior.
 * - Removing cooldown initialization breaks cooldown enforcement.
 */
import "module-alias/register";
import "dotenv/config";

import "@/modules/ui/seyfert-augmentations"; // ! Must load after module-alias and before Seyfert usage.

import type { ParseClient, ParseMiddlewares } from "seyfert";
import { Client, extendContext } from "seyfert";
import { getDb } from "@/db/mongo";
import { CooldownManager } from "@/modules/cooldown";
import { GuildLogger } from "@/utils/guildLogger";
import { middlewares } from "./middlewares";

import "./events/handlers"; // ! Registers base event handlers.
import "./events/listeners"; // ! Registers listeners for custom event flows.

/**
 * Extend the interaction context with helpers that are used across commands.
 *
 * Side effects: None. Returns a function used by the Seyfert client.
 *
 * RISK: Adding heavy work here increases latency for every interaction.
 */
const context = extendContext((interaction) => ({
  getGuildLogger: async (): Promise<GuildLogger> => {
    return await new GuildLogger().init(
      interaction.client,
      interaction.guildId,
    );
  },
}));

const client = new Client<true>({
  context,
  // WHY: globalMiddlewares enforce cross-cutting rules consistently.
  globalMiddlewares: ["featureToggle", "moderationLimit", "guard", "cooldown"],
});

// WHY: Attach the cooldown manager to the client for middleware access.
client.cooldown = new CooldownManager(client);

client.setServices({
  middlewares,
});

/**
 * Bootstraps the bot and uploads commands after the client starts.
 *
 * Side effects: Opens a Mongo connection and starts the gateway client.
 *
 * Errors: Any thrown error is logged and the process remains in a failed state.
 */
async function bootstrap(): Promise<void> {
  console.log("[bootstrap] Starting bot...");
  await getDb(); // initialize Mongo connection once at startup
  await client.start();
  await client.uploadCommands({ cachePath: "./commands.json" });
}

bootstrap().catch((error) => {
  console.error("[bootstrap] Failed to start bot:", error);
});

declare module "seyfert" {
  interface UsingClient extends ParseClient<Client<true>> {
    cooldown: CooldownManager;
  }
  interface Client<Ready extends boolean = boolean> {
    cooldown: Ready extends boolean ? CooldownManager : CooldownManager;
  }
  interface ExtendContext extends ReturnType<typeof context> {}
  interface RegisteredMiddlewares
    extends ParseMiddlewares<typeof middlewares> {}
}
