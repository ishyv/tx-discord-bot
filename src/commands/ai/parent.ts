/**
 * Motivacion: registrar el comando "ai" para configurar el proveedor y modelo por guild.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con subcomandos auto-cargados.
 *
 * Alcance: define el namespace /ai; la logica vive en subcomandos.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "ai",
  description: "Configurar proveedor y modelo de IA",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class AiParentCommand extends Command {}
