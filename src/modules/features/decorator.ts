/**
 * Motivación: proveer un decorador que vincule comandos a features específicas.
 *
 * Idea/concepto: similar a @Cooldown, marca el comando con metadata que indica
 * qué feature debe estar habilitada para ejecutarlo.
 *
 * Alcance: solo define el decorador; la validación real ocurre en el middleware.
 */
import type { Features } from "@/schemas/guild";

/**
 * Props para el decorador BindDisabled.
 */
export interface BindDisabledProps {
    feature: Features;
}

/**
 * Decorador que vincula un comando a una feature específica.
 * Si la feature está deshabilitada, el middleware bloqueará la ejecución.
 *
 * @param feature - La feature que debe estar habilitada para ejecutar este comando.
 * @returns Decorador de clase que agrega la propiedad `disabled`.
 *
 * @example
 * 
 * ```typescript
 * @BindDisabled(Features.Warns)
 * export default class WarnCommand extends Command {
 *   // ...
 * }
 * ```
 */
export function BindDisabled(feature: Features) {
    return <T extends new (...args: any[]) => {}>(target: T) =>
        class extends target {
            disabled = { feature };
        };
}
