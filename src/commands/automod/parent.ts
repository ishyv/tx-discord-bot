import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "automod",
  description: "Configurar reglas de AutoMod",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class AutomodParentCommand extends Command {}
