import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "automod",
  category: HelpCategory.Moderation,
  description: "Configure AutoMod rules for link spam, shorteners, and reporting",
  usage: "/automod",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "automod",
  description: "Configure AutoMod rules",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class AutomodParentCommand extends Command { }
