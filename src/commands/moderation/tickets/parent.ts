/**
 * Tickets Parent Command.
 *
 * Purpose: Configure and manage the tickets system.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "tickets",
  category: HelpCategory.Moderation,
  description: "Configure and manage the tickets system for support channels",
  usage: "/tickets",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "tickets",
  description: "Configure and manage the tickets system",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageChannels"],
})
@AutoLoad()
export default class TicketsParent extends Command { }
