/**
 * Motivación: registrar el comando "offers / parent" dentro de la categoría offers para ofrecer la acción de forma consistente y reutilizable.
 *
 * Idea/concepto: usa el framework de comandos de Seyfert con opciones tipadas y utilidades compartidas para validar la entrada y despachar la lógica.
 *
 * Alcance: maneja la invocación y respuesta del comando; delega reglas de negocio, persistencia y políticas adicionales a servicios o módulos especializados.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "oferta",
  description: "Gestionar ofertas laborales moderadas",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class OffersParent extends Command {}
