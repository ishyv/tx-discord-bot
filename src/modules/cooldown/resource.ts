/**
 * Motivación: gestionar cooldowns (resource) y evitar abusos en comandos o eventos sin duplicar cálculos de tiempo.
 *
 * Idea/concepto: define recursos y un manager que centraliza almacenamiento de enfriamientos y verificación por clave.
 *
 * Alcance: controla ventanas temporales; no decide sanciones ni políticas externas que se disparen al exceder límites.
 */
import { BaseResource, type CacheFrom } from "seyfert/lib/cache";
import type { PickPartial } from "seyfert/lib/common";

export interface CooldownData {
  remaining: number;
  interval: number;
  lastDrip: number;
}

export enum CooldownType {
  User = "user",
  Guild = "guild",
  Channel = "channel",
}

export class CooldownResource extends BaseResource<CooldownData> {
  override namespace = "cooldowns";

  override filter(_data: CooldownData, _id: string): boolean {
    return true;
  }

  override set(
    from: CacheFrom,
    id: string,
    data: PickPartial<CooldownData, "lastDrip">,
  ) {
    return super.set(from, id, {
      ...data,
      lastDrip: data.lastDrip ?? Date.now(),
    });
  }
}
