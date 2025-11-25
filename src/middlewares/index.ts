/**
 * Motivación: aplicar la política de middleware "index" de forma consistente antes de ejecutar comandos.
 *
 * Idea/concepto: usa el pipeline de Seyfert para evaluar permisos, límites o enfriamientos transversales.
 *
 * Alcance: validación previa y control de flujo; no ejecuta la lógica de los comandos ni persiste datos.
 */
import CooldownMiddleware from "./cooldown";
import { moderationLimit } from "./moderationLimit";

export const middlewares = {
  cooldown: CooldownMiddleware,
  moderationLimit,
};
