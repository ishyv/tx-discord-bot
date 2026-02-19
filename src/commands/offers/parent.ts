/**
 * Offers Parent Command.
 *
 * Purpose: Register the parent command for job offer management.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "offer",
  category: HelpCategory.Offers,
  description: "Manage moderated job offers — create, edit, and withdraw listings",
  usage: "/offer",
})
@Declare({
  name: "offer",
  description: "Manage moderated job offers",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class OffersParent extends Command { }
