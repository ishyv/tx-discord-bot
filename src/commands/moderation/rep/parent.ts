/**
* Reputation Parent Command.
*
* Purpose: Manage user reputation.
*/
import { AutoLoad, Command, Declare } from "seyfert";

// Commands for managing reputation
@Declare({
  name: "rep",
  description: "Manage user reputation",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RepParentCommand extends Command { }
