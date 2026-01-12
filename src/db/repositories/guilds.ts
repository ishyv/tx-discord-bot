import {
  GuildSchema,
  type Guild,
} from "@/db/schemas/guild";
import { normalizeStringArray } from "@/db/normalizers";
import type { GuildId } from "@/db/types";
import { MongoStore } from "../mongo-store";

/**
 * Guild Store instance.
 */
export const GuildStore = new MongoStore<Guild>("guilds", GuildSchema);



/**
 * Aplica un `$set` por rutas (dot-notation) sin reescribir el documento completo.
 * Incluye reparaciones defensivas de pipeline.
 */
export async function updateGuildPaths(
  id: GuildId,
  paths: Record<string, unknown>,
  options: { unset?: string[] } = {},
): Promise<void> {
  const now = new Date();
  const removals: Record<string, unknown> = {};
  for (const path of options.unset ?? []) {
    if (path) removals[path] = "$$REMOVE";
  }

  const pipeline = [
    {
      $set: {
        createdAt: { $ifNull: ["$createdAt", now] },
        channels: { $cond: [{ $eq: [{ $type: "$channels" }, "object"] }, "$channels", {}] },
        features: { $cond: [{ $eq: [{ $type: "$features" }, "object"] }, "$features", {}] },
        reputation: { $cond: [{ $eq: [{ $type: "$reputation" }, "object"] }, "$reputation", {}] },
        forumAutoReply: { $cond: [{ $eq: [{ $type: "$forumAutoReply" }, "object"] }, "$forumAutoReply", {}] },
        ai: { $cond: [{ $eq: [{ $type: "$ai" }, "object"] }, "$ai", {}] },
        roles: { $cond: [{ $eq: [{ $type: "$roles" }, "object"] }, "$roles", {}] },
      },
    },
    {
      $set: {
        ...paths,
        ...removals,
        updatedAt: now,
      },
    },
  ];

  await GuildStore.updatePaths(id, {}, { upsert: true, pipeline: pipeline as any });
}







/* ------------------------------------------------------------------------- */
/* Tickets                                                                   */
/* ------------------------------------------------------------------------- */

export async function getPendingTickets(id: GuildId): Promise<string[]> {
  const g = await GuildStore.ensure(id);
  return normalizeStringArray(g.unwrap()?.pendingTickets);
}

export async function setPendingTickets(
  id: GuildId,
  update: (tickets: string[]) => string[]
): Promise<string[]> {
  const current = await getPendingTickets(id);
  const next = Array.from(new Set(update(current).filter(s => typeof s === "string")));
  const res = await GuildStore.patch(id, { pendingTickets: next } as any);
  return normalizeStringArray(res.unwrap()?.pendingTickets);
}
