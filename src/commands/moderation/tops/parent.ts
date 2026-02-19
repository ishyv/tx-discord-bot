import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "tops",
  category: HelpCategory.Moderation,
  description: "Configure and manage the server leaderboards system",
  usage: "/tops",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "tops",
  description: "Configure and manage the leaderboards system",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageChannels"],
})
@AutoLoad()
export default class TopsParent extends Command { }
