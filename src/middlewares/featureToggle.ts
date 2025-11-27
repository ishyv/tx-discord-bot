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
import type { BindDisabledProps } from "@/modules/features/decorator";

export default createMiddleware<void>(async ({ context, next, stop }) => {
    // Verificar si el comando tiene la propiedad `disabled` del decorador
    const disabledProps = (context as any)?.metadata?.disabled as BindDisabledProps | undefined;

    if (!disabledProps) {
        // El comando no tiene @BindDisabled, continuar normalmente
        return next();
    }

    const guildId = context.guildId;
    if (!guildId) {
        // No es un comando de servidor, continuar normalmente
        return next();
    }

    // Verificar si la feature está habilitada
    const enabled = await isFeatureEnabled(guildId, disabledProps.feature);

    if (enabled) {
        return next();
    }

    // Feature deshabilitada, detener ejecución
    await context.write({
        content: `Esta característica (\`${disabledProps.feature}\`) está deshabilitada en este servidor. Un administrador puede habilitarla desde el dashboard.`,
        flags: MessageFlags.Ephemeral,
    });

    return stop("Feature disabled");
});
