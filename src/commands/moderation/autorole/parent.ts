import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "autorole",
  description: "Administra reglas de auto-role",
  defaultMemberPermissions: ["ManageRoles"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  botPermissions: ["ManageRoles"],
})
@AutoLoad()
export default class AutoroleParentCommand extends Command {}
