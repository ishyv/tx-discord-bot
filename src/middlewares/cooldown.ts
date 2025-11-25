/**
 * Motivación: aplicar la política de middleware "cooldown" de forma consistente antes de ejecutar comandos.
 *
 * Idea/concepto: usa el pipeline de Seyfert para evaluar permisos, límites o enfriamientos transversales.
 *
 * Alcance: validación previa y control de flujo; no ejecuta la lógica de los comandos ni persiste datos.
 */
import { createMiddleware, Formatter } from "seyfert";
import { TimestampStyle } from "seyfert/lib/common";

export default createMiddleware<void>(async ({ context, next, stop }) => {
  const inCooldown = context.client.cooldown.context(context);

  //TODO: Mejorar mensaje

  typeof inCooldown === "number"
    ? stop(
        `Estas usando un comando muy seguido, intenta nuevamente en ${Formatter.timestamp(new Date(Date.now() + inCooldown), TimestampStyle.RelativeTime)}`,
      )
    : next();
});
