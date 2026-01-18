/**
 * Motivación: aplicar la política de middleware "cooldown" de forma consistente antes de ejecutar comandos.
 *
 * Idea/concepto: usa el pipeline de Seyfert para evaluar permisos, límites o enfriamientos transversales.
 *
 * Alcance: validación previa y control de flujo; no ejecuta la lógica de los comandos ni persiste datos.
 */
import { createMiddleware, Formatter } from "seyfert";
import { TimestampStyle } from "seyfert/lib/common";

const COOLDOWN_MARK = Symbol("cooldownChecked");

export default createMiddleware<void>(async ({ context, next, pass }) => {
  const state = context as unknown as Record<string | symbol, unknown>;
  if (state[COOLDOWN_MARK]) return next();
  state[COOLDOWN_MARK] = true;

  const inCooldown = context.client.cooldown.context(context);

  if (typeof inCooldown === "number") {
    const remainingMs = Math.max(0, Math.ceil(inCooldown));
    await context.write({
      content: `Estas usando un comando muy seguido, intenta nuevamente en ${Formatter.timestamp(new Date(Date.now() + remainingMs), TimestampStyle.RelativeTime)}`,
    });
    return pass();
  }

  return next();
});
