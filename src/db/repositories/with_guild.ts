/**
 * Functional helpers to mutate guild documents safely.
 * Purpose: preserve legacy API (`withGuild`, `getGuild`, `ensureGuild`) while delegating to the new guild repository.
 */
import type { Guild } from "@/db/schemas/guild";
import type { GuildId } from "@/db/types";
import { deepClone } from "@/db/helpers";
import { ensureGuild as ensureGuildRepo, updateGuild as updateGuildRepo, getGuild as getGuildRepo } from "@/db/repositories/guilds";

export async function withGuild<T>(
  id: GuildId,
  callback: (guild: Guild) => Promise<T> | T,
): Promise<T> {
  const current = await ensureGuildRepo(id);
  const working: Guild = deepClone(current);
  const result = await callback(working);
  await updateGuildRepo(id, { ...working, updatedAt: new Date() });
  return result;
}

export async function getGuild(id: string): Promise<Guild | null> {
  return getGuildRepo(id);
}

export async function ensureGuild(id: string): Promise<Guild> {
  return ensureGuildRepo(id);
}
