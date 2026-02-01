/**
 * Tickets Parent Command.
 *
 * Purpose: Configure and manage the tickets system.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "tickets",
  description: "Configure and manage the tickets system",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageChannels"],
})
@AutoLoad()
export default class TicketsParent extends Command { }
