/**
 * Propósito: adaptar los cooldowns al sistema de recursos de Seyfert para
 * persistirlos en el cache gateway con un namespace dedicado.
 * Encaje: usado por `CooldownManager` como backend de almacenamiento (no decide
 * políticas).
 * Invariantes: `namespace` fijo `cooldowns`; `set` siempre persiste `lastDrip`
 * con marca temporal actual si no se provee.
 * Gotchas: `filter` permite todo; cualquier validación de límites debe ocurrir
 * en el manager, no aquí.
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

  /**
   * No filtra datos: toda validación ocurre en el manager que conoce el schema.
   */
  override filter(_data: CooldownData, _id: string): boolean {
    return true;
  }

  /**
   * Garantiza que cada set tenga `lastDrip` consistente.
   *
   * WHY: algunos callers no conocen el último uso; si no se fuerza aquí se
   * almacenaría `undefined` y rompería el cálculo de ventanas.
   */
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
