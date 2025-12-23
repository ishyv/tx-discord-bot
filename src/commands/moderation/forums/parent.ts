/**
 * Motivación: registrar el comando "moderation / forums / parent" para configurar foros monitoreados.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega persistencia y lógica al módulo correspondiente.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "forums",
  description: "Gestionar foros monitoreados por la IA",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class ForumsParentCommand extends Command {}
