/**
 * Motivación: punto de arranque del bot para inicializar contexto, middlewares y registrar comandos/eventos de Seyfert.
 *
 * Idea/concepto: prepara el cliente de Seyfert con extensiones propias (cooldowns, loggers) y carga automática de eventos/listeners antes de iniciar.
 *
 * Alcance: orquesta el bootstrap y la subida de comandos; no contiene reglas de negocio ni lógica de cada feature individual.
 */
import "@/modules/ui/seyfert-augmentations"; // ! Augmentations must be imported first to take effect

import "module-alias/register";
import "dotenv/config";

import type { ParseClient, ParseMiddlewares } from "seyfert";
import { Client, extendContext } from "seyfert";
import { CooldownManager } from "@/modules/cooldown";
import { GuildLogger } from "@/utils/guildLogger";
import { fixDb } from "@/db/fixDb";
import { middlewares } from "./middlewares";

import "./events/handlers"; // ! Cargar manejadores de eventos base (messageCreate, reactions, etc.) se encarga de emitir eventos a los listeners
import "./events/listeners"; // ! Cargar listeners de eventos, se encarga de que los listeners se registren en sus respectivos eventos


// Scopes to debug
// import { startDebugRepl } from "./modules/debug/debugRepl";
// import * as invMod from '@/modules/inventory'
// import * as ecoMod from '@/modules/economy'

// startDebugRepl({
//   port: 6767,
//   prompt: "fenatilo> ",
//   scope: {
//     invMod,
//     ecoMod,
//   },
// });



const context = extendContext((interaction) => ({
  getGuildLogger: async (): Promise<GuildLogger> => {
    return await new GuildLogger().init(interaction.client, interaction.guildId);
  },
}));

const client = new Client<true>({
  context,
  globalMiddlewares: ["featureToggle", "moderationLimit"],
});

client.cooldown = new CooldownManager(client);

client.setServices({
  middlewares,
});

async function bootstrap(): Promise<void> {
  console.log("[bootstrap] Starting bot...");
  await fixDb();
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
    cooldown: CooldownManager;
  }
  interface ExtendContext extends ReturnType<typeof context> { }
  interface RegisteredMiddlewares
    extends ParseMiddlewares<typeof middlewares> { }
}
