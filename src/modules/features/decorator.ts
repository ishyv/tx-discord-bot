/**
 * Motivación: proveer un decorador que vincule comandos a features específicas.
 *
 * Idea/concepto: similar a @Cooldown, marca el comando con metadata que indica
 * qué feature debe estar habilitada para ejecutarlo.
 *
 * Alcance: solo define el decorador; la validación real ocurre en el middleware.
 */
import type { Features } from "@/db/schemas/guild";

export interface BindDisabledProps {
  feature: Features;
}

export interface FeatureBoundCommand {
  disabled?: BindDisabledProps;
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
type FeatureBoundConstructor = {
  prototype: FeatureBoundCommand;
};

export function BindDisabled(feature: Features): ClassDecorator {
  return (target) => {
    (target as FeatureBoundConstructor).prototype.disabled = { feature };
  };
}

/**
 * Extrae la feature vinculada desde la instancia del comando.
 */
export function getBoundFeature(command: unknown): Features | null {
  if (!command || typeof command !== "object") return null;
  const disabled = (command as FeatureBoundCommand).disabled;
  return disabled?.feature ?? null;
}
