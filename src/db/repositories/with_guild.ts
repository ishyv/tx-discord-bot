import { deepClone } from "@/db/helpers";
import type { Guild } from "@/db/schemas/guild";
import type { GuildId } from "@/db/types";
import { GuildStore } from "./guilds";

export async function ensureGuild(id: GuildId): Promise<Guild> {
  const res = await GuildStore.ensure(id);
  if (res.isErr()) throw res.error;
  return res.unwrap();
}

export async function getGuild(id: GuildId): Promise<Guild | null> {
  const res = await GuildStore.get(id);
  if (res.isErr()) throw res.error;
  return res.unwrap();
}

export async function withGuild<T>(
  id: GuildId,
  mutate: (guild: Guild) => T,
): Promise<T> {
  const current = await ensureGuild(id);
  const cloned = deepClone(current);
  const result = mutate(cloned);
  const res = await GuildStore.set(id, cloned as any);
  if (res.isErr()) throw res.error;
  return result;
}
