/**
 * Perk Repository.
 *
 * Purpose: read/write perk state stored on user documents.
 */

import { UserStore } from "@/db/repositories/users";
import type { GuildId, UserId } from "@/db/types";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { PerkState } from "./types";
import type { PerkStateData } from "@/db/schemas/perks";

type PerkSnapshot = Record<string, PerkStateData>;

const emptyState = (guildId: GuildId, userId: UserId): PerkState => ({
  guildId,
  userId,
  levels: {},
  updatedAt: new Date(0),
});

export interface PerkRepo {
  getState(guildId: GuildId, userId: UserId): Promise<Result<PerkState, Error>>;
}

class PerkRepoImpl implements PerkRepo {
  async getState(
    guildId: GuildId,
    userId: UserId,
  ): Promise<Result<PerkState, Error>> {
    const userResult = await UserStore.ensure(userId);
    if (userResult.isErr()) return ErrResult(userResult.error);

    const user = userResult.unwrap();
    const snapshot = (user.perks ?? {}) as PerkSnapshot;
    const state = snapshot[guildId];
    if (!state) {
      return OkResult(emptyState(guildId, userId));
    }

    return OkResult({
      guildId,
      userId,
      levels: state.levels ?? {},
      updatedAt: state.updatedAt ?? new Date(0),
    });
  }
}

export const perkRepo: PerkRepo = new PerkRepoImpl();
