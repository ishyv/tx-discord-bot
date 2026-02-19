/**
 * Wallet Commands (Parent).
 *
 * Purpose: Parent command for all currency/economy management.
 * Context: Balance, bank, deposit, withdraw, daily rewards.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "wallet",
  category: HelpCategory.Economy,
  description: "Currency management — check balance, bank, deposit, withdraw, and claim daily rewards",
  usage: "/wallet balance | /wallet daily | /wallet deposit <amount> | /wallet withdraw <amount>",
})
@Declare({
    name: "wallet",
    description: "💰 Currency management - balance, bank, transfers",
    contexts: ["Guild"],
    integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class WalletParentCommand extends Command { }
