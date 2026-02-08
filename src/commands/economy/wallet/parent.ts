/**
 * Wallet Commands (Parent).
 *
 * Purpose: Parent command for all currency/economy management.
 * Context: Balance, bank, deposit, withdraw, daily rewards.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
    name: "wallet",
    description: "💰 Currency management - balance, bank, transfers",
    contexts: ["Guild"],
    integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class WalletParentCommand extends Command { }
