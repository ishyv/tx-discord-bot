/**
 * Offers Parent Command.
 *
 * Purpose: Register the parent command for job offer management.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "offer",
  description: "Manage moderated job offers",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class OffersParent extends Command { }
