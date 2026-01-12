/**
 * Decorador para adjuntar metadata de guardas a los comandos.
 */
import type { PermissionStrings } from "seyfert";

export interface GuardMetadata {
    /** Indica si el comando solo puede ejecutarse en un servidor. */
    guildOnly?: boolean;
    /** Permisos de Discord requeridos (o string[]). */
    permissions?: PermissionStrings | bigint;
    /** Clave de acción personalizada para el sistema de overrides de roles. */
    actionKey?: string;
    /** Feature asociada para validación de habilitación. */
    feature?: string;
}

export interface GuardedCommand {
    __guard?: GuardMetadata;
}

/**
 * Decorador que adjunta configuración de seguridad al comando.
 * Esta metadata es leída por el GuardMiddleware.
 */
export function Guard(metadata: GuardMetadata): ClassDecorator {
    return (target) => {
        (target as any).prototype.__guard = metadata;
    };
}

/**
 * Extrae la metadata del guard de una instancia de comando.
 */
export function getGuardMetadata(command: any): GuardMetadata | null {
    return command?.__guard ?? null;
}
