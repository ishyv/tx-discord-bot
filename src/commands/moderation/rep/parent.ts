import { AutoLoad, Command, Declare } from "seyfert";

// Comandos para manejar la rep
@Declare({
    name: "rep",
    description: "Gestionar la reputacion de los usuarios",
    defaultMemberPermissions: ["ManageGuild"],
    contexts: ["Guild"],
    integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RepParentCommand extends Command { }
