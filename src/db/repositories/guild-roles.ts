import { GuildStore } from "./guilds";
import { type GuildRolesRecord } from "@/db/schemas/guild";
import { deepClone } from "@/db/helpers";
import { type GuildId } from "@/db/types";
import { type Result } from "@/utils/result";

const normAction = (k: string) =>
  k
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/**
 * Specialized repository for managing guild roles, overrides, and limits.
 */
export const GuildRolesRepo = {
  async read(id: GuildId): Promise<Result<GuildRolesRecord>> {
    const res = await GuildStore.ensure(id);
    return res.map((g) => deepClone((g.roles as GuildRolesRecord) ?? {}));
  },

  async write(
    id: GuildId,
    mutate: (current: GuildRolesRecord) => GuildRolesRecord,
  ): Promise<Result<GuildRolesRecord>> {
    const currentRes = await this.read(id);
    if (currentRes.isErr()) return currentRes;

    const next = deepClone(mutate(currentRes.unwrap()));
    const res = await GuildStore.patch(id, { roles: next } as any);
    return res.map((g) => deepClone((g.roles as GuildRolesRecord) ?? {}));
  },

  async update(
    id: GuildId,
    key: string,
    patch: any,
  ): Promise<Result<GuildRolesRecord>> {
    return this.write(id, (r) => ({
      ...r,
      [key]: {
        ...(r?.[key] ?? {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  },

  async remove(id: GuildId, key: string): Promise<Result<GuildRolesRecord>> {
    return this.write(id, (r) => {
      if (!r?.[key]) return r;
      const { [key]: _omit, ...rest } = r;
      return rest;
    });
  },

  async setOverride(
    id: GuildId,
    roleKey: string,
    actionKey: string,
    override: any,
  ): Promise<Result<void>> {
    const currentRes = await this.read(id);
    if (currentRes.isErr()) return currentRes.map(() => undefined);

    const current = currentRes.unwrap();
    const role = (current as any)?.[roleKey] ?? {};
    const k = normAction(actionKey);
    const reach = { ...(role?.reach ?? {}) };
    reach[k] = override;

    const res = await this.update(id, roleKey, { reach });
    return res.map(() => undefined);
  },

  async setLimit(
    id: GuildId,
    roleKey: string,
    actionKey: string,
    limit: {
      limit: number;
      window?: string | null;
      windowSeconds?: number | null;
    },
  ): Promise<Result<void>> {
    const currentRes = await this.read(id);
    if (currentRes.isErr()) return currentRes.map(() => undefined);

    const current = currentRes.unwrap();
    const role = (current as any)?.[roleKey] ?? {};
    const k = normAction(actionKey);
    const limits = { ...(role?.limits ?? {}) };
    limits[k] = {
      limit: limit.limit,
      window: limit.window ?? null,
      windowSeconds: limit.windowSeconds ?? null,
    };

    const res = await this.update(id, roleKey, { limits });
    return res.map(() => undefined);
  },
};
