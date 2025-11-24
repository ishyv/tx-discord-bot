import "@/modules/ui/seyfert-augmentations"; // ! Augmentations must be imported first to take effect

import "module-alias/register";
import "dotenv/config";

import type { ParseClient, ParseMiddlewares } from "seyfert";
import { Client, extendContext } from "seyfert";
import { CooldownManager } from "@/modules/cooldown";
import { GuildLogger } from "@/utils/guildLogger";
import { middlewares } from "./middlewares";

import "./events"; // ! Cargar eventos base (messageCreate, reactions, etc.)
import "./events/listeners"; // ! Cargar listeners de eventos

const context = extendContext((interaction) => ({
  getGuildLogger: async (): Promise<GuildLogger> => {
    return await new GuildLogger().init(interaction.client);
  },
}));

const client = new Client<true>({
  context,
  globalMiddlewares: ["moderationLimit"],
});

client.cooldown = new CooldownManager(client);

client.setServices({
  middlewares,
});

client
  .start()
  .then(() => client.uploadCommands({ cachePath: "./commands.json" }));

declare module "seyfert" {
  interface UsingClient extends ParseClient<Client<true>> {
    cooldown: CooldownManager;
  }
  interface Client<Ready extends boolean = boolean> {
    cooldown: CooldownManager;
  }
  interface ExtendContext extends ReturnType<typeof context> {}
  interface RegisteredMiddlewares
    extends ParseMiddlewares<typeof middlewares> {}
}





