/**
 * Motivación: registrar el comando "moderation / roles / parent" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { AutoLoad, Command, Declare } from "seyfert";

// Espacio raiz para administrar roles del bot.
@Declare({
  name: "roles",
  description: "Gestionar roles administrados por el bot",
  defaultMemberPermissions: ["ManageGuild"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RoleParentCommand extends Command {}
