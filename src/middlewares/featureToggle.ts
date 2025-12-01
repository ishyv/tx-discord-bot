/**
 * Motivación: aplicar la política de validación de features de forma consistente antes de ejecutar comandos.
 *
 * Idea/concepto: usa el pipeline de Seyfert para validar que la feature esté habilitada antes
 * de ejecutar comandos marcados con @BindDisabled.
 *
 * Alcance: validación previa y control de flujo; no ejecuta la lógica de los comandos.
 */
import { createMiddleware } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { isFeatureEnabled } from "@/modules/features";
import { getBoundFeature } from "@/modules/features/decorator";

export const featureToggleMiddleware = createMiddleware<void>(async ({ context, next, stop }) => {
  const boundFeature = getBoundFeature((context as { command?: unknown })?.command);
  if (!boundFeature) return next();

  const guildId = context.guildId;
  if (!guildId) return next();

  const enabled = await isFeatureEnabled(guildId, boundFeature);
  if (enabled) return next();

  await context.write({
    content: `Esta característica (\`${boundFeature}\`) está deshabilitada en este servidor. Un administrador puede habilitarla desde el dashboard.`,
    flags: MessageFlags.Ephemeral,
  });

  return stop("Feature disabled");
});
