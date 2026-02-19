/**
* Reputation Parent Command.
*
* Purpose: Manage user reputation.
*/
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

// Commands for managing reputation
@HelpDoc({
  command: "rep",
  category: HelpCategory.Moderation,
  description: "Manage user reputation — add, remove, request, and configure reputation",
  usage: "/rep",
})
@Declare({
  name: "rep",
  description: "Manage user reputation",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RepParentCommand extends Command { }
