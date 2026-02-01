import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "tops",
  description: "Configurar y manejar el sistema de tops",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageChannels"],
})
@AutoLoad()
export default class TopsParent extends Command {}
