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

import {
	validateCommandPayload,
	printIssues,
	hasCriticalIssues,
} from "@/dev/commandPreflight";
import { prettyPrintDiscord50035 } from "@/dev/prettyCommandRegistrationError";
import { loadContentRegistryOrThrow } from "@/modules/content";
import { rpgQuestService } from "@/modules/rpg/quests";

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
  await loadContentRegistryOrThrow();
  console.log("[bootstrap] Content packs loaded successfully.");
  const questInit = await rpgQuestService.ensureReady();
  if (questInit.isErr()) {
    throw questInit.error;
  }
  console.log("[bootstrap] Quest packs loaded successfully.");
  await getDb(); // initialize Mongo connection once at startup
  await client.start();

  // Preflight validation before uploading commands
  console.log("[bootstrap] Running command preflight validation...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commands = (client.commands as any)?.values ?? [];
  console.log(`[bootstrap] Total commands loaded: ${commands.length}`);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commandArray: any[] = commands.map((cmd: any, idx: number) => {
    // Debug: log command structure
    console.log(`[bootstrap] Command ${idx}: ${cmd.name} (${cmd.constructor?.name ?? 'unknown'})`);
    console.log(`[bootstrap]   - options type: ${typeof cmd.options}`);
    console.log(`[bootstrap]   - options keys: ${cmd.options ? Object.keys(cmd.options).join(', ') : 'none'}`);
    
    return {
      name: cmd.name,
      description: cmd.description,
      options: (cmd.options ?? {}) as Record<string, unknown>,
    };
  });

  const issues = validateCommandPayload(commandArray);
  if (hasCriticalIssues(issues)) {
    console.error(printIssues(issues, commandArray));
    console.error("[bootstrap] Command validation failed. Aborting startup.");
    process.exit(1);
  }
  console.log("[bootstrap] Command preflight validation passed.");

  // Upload commands with pretty error handling
  try {
    await client.uploadCommands({ cachePath: "./commands.json" });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.message?.includes("50035") || err.message?.includes("Invalid Form Body")) {
      console.error(prettyPrintDiscord50035(err, commandArray));
      console.error("[bootstrap] Command registration failed. Aborting startup.");
      process.exit(1);
    }
    throw error;
  }
}

bootstrap().catch((error) => {
  console.error("[bootstrap] Failed to start bot:", error);
  if (error && typeof error === "object" && "details" in (error as Record<string, unknown>)) {
    const details = (error as { details?: unknown }).details;
    if (Array.isArray(details)) {
      for (const detail of details) {
        console.error(`[bootstrap]   - ${String(detail)}`);
      }
    }
  }
  process.exit(1);
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
