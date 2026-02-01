/**
 * Equipment Repository.
 *
 * Purpose: Read/write equipment loadout stored on user documents.
 */

import { UserStore } from "@/db/repositories/users";
import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { EquipmentLoadout, EquipmentSlot, EquippedItem } from "./types";

interface EquipmentStateData {
  slots: Record<string, { itemId: string; equippedAt: string }>;
  updatedAt: string;
}

const emptyLoadout = (guildId: GuildId, userId: UserId): EquipmentLoadout => ({
  guildId,
  userId,
  slots: {},
  updatedAt: new Date(0),
});

/** Parse slot data from DB format. */
const parseEquippedItem = (data: unknown): EquippedItem | null => {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.itemId !== "string") return null;
  const equippedAt = d.equippedAt ? new Date(String(d.equippedAt)) : new Date();
  return { itemId: d.itemId, equippedAt };
};

export interface EquipmentRepo {
  /**
   * Get equipment loadout for a user in a guild.
   */
  getLoadout(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipmentLoadout, Error>>;

  /**
   * Get equipped item in a specific slot.
   */
  getEquippedItem(
    guildId: GuildId,
    userId: UserId,
    slot: EquipmentSlot,
  ): Promise<Result<EquippedItem | null, Error>>;
}

class EquipmentRepoImpl implements EquipmentRepo {
  async getLoadout(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<EquipmentLoadout, Error>> {
    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    const equipment = (user.equipment ?? {}) as Record<
      string,
      EquipmentStateData | undefined
    >;
    const state = equipment[guildId];

    if (!state) {
      return OkResult(emptyLoadout(guildId, userId));
    }

    const slots: EquipmentLoadout["slots"] = {};
    for (const [slot, data] of Object.entries(state.slots ?? {})) {
      const parsed = parseEquippedItem(data);
      if (parsed) {
        slots[slot as EquipmentSlot] = parsed;
      }
    }

    return OkResult({
      guildId,
      userId,
      slots,
      updatedAt: new Date(state.updatedAt ?? 0),
    });
  }

  async getEquippedItem(
    guildId: GuildId,
    userId: UserId,
    slot: EquipmentSlot,
  ): Promise<Result<EquippedItem | null, Error>> {
    const loadoutResult = await this.getLoadout(guildId, userId);
    if (loadoutResult.isErr()) return ErrResult(loadoutResult.error);

    const loadout = loadoutResult.unwrap();
    return OkResult(loadout.slots[slot] ?? null);
  }
}

export const equipmentRepo: EquipmentRepo = new EquipmentRepoImpl();
