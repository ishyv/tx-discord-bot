/**
 * Motivación: registrar el comando "moderation / autorole / parent" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
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
