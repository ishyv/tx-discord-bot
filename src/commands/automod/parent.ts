import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "automod",
  description: "Configure AutoMod rules",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class AutomodParentCommand extends Command { }
