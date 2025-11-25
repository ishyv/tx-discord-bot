/**
 * Motivación: registrar el comando "moderation / channels / parent" dentro de la categoría moderation para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { AutoLoad, Command, Declare } from "seyfert";

// Espacio raiz de comandos para gestionar canales.
@Declare({
  name: "channels",
  description: "Gestionar los canales usados por el bot",
  defaultMemberPermissions: ["ManageGuild"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class ChannelParentCommand extends Command {}
