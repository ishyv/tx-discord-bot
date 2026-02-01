/**
 * Motivación: registrar el comando "moderation / warn / parent" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "warn",
  description: "Manejar los warns de los usuarios",
  defaultMemberPermissions: ["KickMembers"],
})
@AutoLoad()
export default class WarnParent extends Command {}
