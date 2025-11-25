/**
 * Motivación: gestionar cooldowns (index) y evitar abusos en comandos o eventos sin duplicar cálculos de tiempo.
 *
 * Idea/concepto: define recursos y un manager que centraliza almacenamiento de enfriamientos y verificación por clave.
 *
 * Alcance: controla ventanas temporales; no decide sanciones ni políticas externas que se disparen al exceder límites.
 */
import type { CooldownProps } from "./manager";

export * from "./manager";
export * from "./resource";

export function Cooldown(props: CooldownProps) {
  return <T extends new (...args: any[]) => {}>(target: T) =>
    class extends target {
      cooldown = props;
    };
}
