// Single-file, flat module. No factories, no classes. Just dumb functions.
// Assumes a shared Drizzle instance exported from "@/db".
// If you ever need to test, you can still swap the module via jest/ts-node mocks.

import { db } from "@/db";
import { and, count, eq, isNotNull, lte, sql } from "drizzle-orm";
import { users } from "@/schemas/user";
import { guilds } from "@/schemas/guild";
import {
    autoRoleGrants,
    autoRoleReactionTallies,
    autoRoleRules,
} from "@/schemas/autorole";
import type {
    AutoRoleGrant,
    AutoRoleReactionTally,
    AutoRoleRule as AutoRoleRuleRow,
} from "@/schemas/autorole";
import type {
    AutoRoleGrantReason,
    AutoRoleRule,
    CreateAutoRoleRuleInput,
    DeleteRuleInput,
    GrantByRuleInput,
    ReactionPresenceKey,
    ReactionTallyKey,
    ReactionTallySnapshot,
    RevokeByRuleInput,
    UpdateRuleEnabledInput,
} from "@/modules/autorole/types";
import {
    clearPresence,
    clearPresenceForMessage,
    deleteTalliesForMessage,
    deleteTally,
    getTally,
    markPresence,
    removeRule as removeRuleFromCache,
    setGuildRules,
    setTally,
    upsertRule as upsertRuleInCache,
} from "@/modules/autorole/cache";
import { isLiveRule } from "@/modules/autorole/parsers";
import type { UsingClient } from "seyfert";
import { enqueueRoleGrant, enqueueRoleRevoke } from "@/systems/autorole/roleOps";
import { format as formatMs } from "@/utils/ms";
import { deepClone } from "./helpers";

type UserPatch = Partial<{
    bank: number;
    cash: number;
    rep: number;
    warns: any[];
    openTickets: string[];
}>;

// ----------------------------- USERS -----------------------------
export async function getUser(id: string) {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
}

export async function userExists(id: string) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    return !!row;
}

export async function ensureUser(id: string, init: UserPatch = {}) {
    const [inserted] = await db.insert(users).values({ id, ...init }).onConflictDoNothing().returning();
    if (inserted) return inserted;
    const existing = await getUser(id);
    if (!existing) throw new Error(`ensureUser failed (id=${id})`);
    return existing;
}

export async function upsertUser(id: string, patch: UserPatch = {}) {
    const [row] = await db.insert(users).values({ id, ...patch }).onConflictDoUpdate({ target: users.id, set: { ...patch } }).returning();
    return row!;
}

export async function updateUser(id: string, patch: UserPatch) {
    if (!patch || Object.keys(patch).length === 0) return (await getUser(id)) ?? null;
    const [row] = await db.update(users).set({ ...patch }).where(eq(users.id, id)).returning();
    return row ?? null;
}

export async function removeUser(id: string) {
    const res = await db.delete(users).where(eq(users.id, id));
    return (res.rowCount ?? 0) > 0;
}

export async function bumpBalance(id: string, delta: { bank?: number; cash?: number }) {
    await ensureUser(id);
    const updates: any = {};
    if (typeof delta.bank === "number") updates.bank = sql`${users.bank} + ${delta.bank}`;
    if (typeof delta.cash === "number") updates.cash = sql`${users.cash} + ${delta.cash}`;
    if (Object.keys(updates).length === 0) return await getUser(id);
    const [row] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return row ?? null;
}

export async function getUserReputation(id: string): Promise<number> {
    const user = await ensureUser(id);
    return Math.max(0, Number(user.rep ?? 0));
}

export async function setUserReputation(id: string, value: number): Promise<number> {
    await ensureUser(id);
    const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
    const target = numeric < 0 ? 0 : numeric;
    const [row] = await db
        .update(users)
        .set({ rep: target })
        .where(eq(users.id, id))
        .returning({ rep: users.rep });
    return Number(row?.rep ?? target);
}

export async function adjustUserReputation(id: string, delta: number): Promise<number> {
    await ensureUser(id);
    if (!Number.isFinite(delta)) return getUserReputation(id);
    const step = Math.trunc(delta);
    if (step === 0) return getUserReputation(id);

    const [row] = await db
        .update(users)
        .set({
            rep: sql`GREATEST(${users.rep} + ${step}, 0)`,
        })
        .where(eq(users.id, id))
        .returning({ rep: users.rep });
    return Math.max(0, Number(row?.rep ?? 0));
}

interface ReputationRuleInput {
    guildId: string;
    name: string;
    minRep: number;
    roleId: string;
    createdBy?: string | null;
}

export async function upsertReputationRule(input: ReputationRuleInput): Promise<AutoRoleRule> {
    await ensureGuild(input.guildId);
    const payload = {
        guildId: input.guildId,
        name: input.name,
        triggerType: "REPUTATION_THRESHOLD" as const,
        args: { minRep: input.minRep },
        roleId: input.roleId,
        durationMs: null,
        enabled: true,
        createdBy: input.createdBy ?? null,
    };

    const [row] = await db
        .insert(autoRoleRules)
        .values(payload)
        .onConflictDoUpdate({
            target: [autoRoleRules.guildId, autoRoleRules.name],
            set: {
                triggerType: "REPUTATION_THRESHOLD",
                args: payload.args,
                roleId: input.roleId,
                enabled: true,
                updatedAt: sql`now()`,
            },
        })
        .returning();

    const rule = toAutoRoleRule(row);
    upsertRuleInCache(rule);
    return rule;
}

export async function applyReputationPreset(
    guildId: string,
    entries: Array<{ name: string; minRep: number; roleId: string }>,
    createdBy?: string | null,
): Promise<AutoRoleRule[]> {
    const applied: AutoRoleRule[] = [];
    for (const entry of entries) {
        const rule = await upsertReputationRule({
            guildId,
            name: entry.name,
            minRep: entry.minRep,
            roleId: entry.roleId,
            createdBy,
        });
        applied.push(rule);
    }

    const keep = new Set(entries.map((entry) => entry.name));
    const existing = await autoRoleFetchRulesByGuild(guildId);
    for (const rule of existing) {
        if (rule.trigger.type === "REPUTATION_THRESHOLD" && !keep.has(rule.name)) {
            await deleteRule(guildId, rule.name);
        }
    }

    return applied;
}

export async function listWarns(id: string) {
    const u = await ensureUser(id);
    return Array.isArray(u.warns) ? deepClone(u.warns) : [];
}

export async function setWarns(id: string, warns: any[]) {
    await ensureUser(id);
    const [row] = await db.update(users).set({ warns }).where(eq(users.id, id)).returning();
    return row!.warns ?? [];
}

export async function addWarn(id: string, warn: any) {
    const current = await listWarns(id);
    current.push(warn);
    const [row] = await db.update(users).set({ warns: current }).where(eq(users.id, id)).returning();
    return row!.warns ?? [];
}

export async function removeWarn(id: string, warnId: string) {
    const current = await listWarns(id);
    const next = current.filter((w: any) => w?.warn_id !== warnId);
    const [row] = await db.update(users).set({ warns: next }).where(eq(users.id, id)).returning();
    return row!.warns ?? [];
}

export async function clearWarns(id: string) {
    const [row] = await db.update(users).set({ warns: [] }).where(eq(users.id, id)).returning();
    return row!.warns ?? [];
}

export async function listOpenTickets(id: string) {
    const user = await ensureUser(id);
    return Array.isArray(user.openTickets) ? deepClone(user.openTickets) : [];
}

export async function setOpenTickets(id: string, tickets: string[]) {
    await ensureUser(id);
    const unique = Array.from(new Set(tickets.filter((value): value is string => typeof value === "string" && value.length > 0)));
    const [row] = await db
        .update(users)
        .set({ openTickets: unique })
        .where(eq(users.id, id))
        .returning({ openTickets: users.openTickets });
    return Array.isArray(row?.openTickets) ? deepClone(row.openTickets) : [];
}

export async function addOpenTicket(id: string, channelId: string) {
    const current = await listOpenTickets(id);
    if (current.includes(channelId)) return current;
    current.push(channelId);
    return setOpenTickets(id, current);
}

export async function removeOpenTicket(id: string, channelId: string) {
    const current = await listOpenTickets(id);
    return setOpenTickets(
        id,
        current.filter((entry) => entry !== channelId),
    );
}

export async function removeOpenTicketByChannel(channelId: string) {
    if (!channelId) return;
    const rows = await db.select({ id: users.id, openTickets: users.openTickets }).from(users);
    const owners = rows
        .filter(
            (row) =>
                Array.isArray(row.openTickets) &&
                row.openTickets.some((entry) => entry === channelId),
        )
        .map((row) => row.id);

    await Promise.all(
        owners.map((ownerId) => removeOpenTicket(ownerId, channelId).catch((error) => {
            console.error("[repo] removeOpenTicket failed", { ownerId, channelId, error });
        })),
    );
}

// ----------------------------- GUILDS -----------------------------
export async function getGuild(id: string) {
    const [row] = await db.select().from(guilds).where(eq(guilds.id, id)).limit(1);
    return row ?? null;
}

export async function ensureGuild(id: string) {
    const [inserted] = await db.insert(guilds).values({ id }).onConflictDoNothing().returning();
    if (inserted) return inserted;
    const existing = await getGuild(id);
    if (!existing) throw new Error(`ensureGuild failed (id=${id})`);
    return existing;
}

export async function deleteGuild(id: string) {
    const res = await db.delete(guilds).where(eq(guilds.id, id));
    return (res.rowCount ?? 0) > 0;
}

// JSON accessors. Keep shapes flexible.
export async function readChannels(id: string) {
    const g = await ensureGuild(id);
    return deepClone(g.channels ?? {});
}

export async function writeChannels(id: string, mutate: (current: any) => any) {
    const current = await readChannels(id);
    const next = deepClone(mutate(current));
    const [row] = await db.update(guilds).set({ channels: next, updatedAt: new Date() }).where(eq(guilds.id, id)).returning();
    return row!.channels;
}

// Repo accessors always clone persisted JSON so callers can safely mutate snapshots.
export async function readRoles(id: string) {
    const g = await ensureGuild(id);
    return deepClone(g.roles ?? {});
}

export async function writeRoles(id: string, mutate: (current: any) => any) {
    const current = await readRoles(id);
    const next = deepClone(mutate(current));
    const [row] = await db.update(guilds).set({ roles: next, updatedAt: new Date() }).where(eq(guilds.id, id)).returning();
    return row!.roles;
}

// ----------------------------- TICKETS -----------------------------
export async function getPendingTickets(guildId: string) {
    const g = await ensureGuild(guildId);
    return Array.isArray(g.pendingTickets) ? deepClone(g.pendingTickets) : [];
}

export async function setPendingTickets(guildId: string, update: (tickets: string[]) => string[]) {
    const guild = await ensureGuild(guildId);
    const current = Array.isArray(guild.pendingTickets) ? deepClone(guild.pendingTickets) : [];
    const next = update(deepClone(current));
    const sanitized = Array.isArray(next) ? next.filter((id): id is string => typeof id === "string") : [];
    const unique = Array.from(new Set(sanitized));
    const [row] = await db
        .update(guilds)
        .set({ pendingTickets: unique, updatedAt: new Date() })
        .where(eq(guilds.id, guildId))
        .returning({ pendingTickets: guilds.pendingTickets });
    return deepClone(row?.pendingTickets ?? []);
}

// Convenience wrappers (optional)
export async function setCoreChannel(id: string, name: string, channelId: string) {
    return writeChannels(id, (c: any) => {
        const next = deepClone(c);
        next.core = next.core ?? {};
        next.core[name] = { ...(next.core[name] ?? { name, label: name, channelId: null }), channelId };
        return next;
    });
}

export async function getCoreChannel(id: string, name: string) {
    const c = await readChannels(id);
    const core = c?.core;
    if (!core) return null;
    return core[name as keyof typeof core] ?? null;
}

export async function setTicketCategory(id: string, categoryId: string | null) {
    return writeChannels(id, (c: any) => ({ ...c, ticketCategoryId: categoryId }));
}

export async function setTicketMessage(id: string, messageId: string | null) {
    return writeChannels(id, (c: any) => ({ ...c, ticketMessageId: messageId }));
}

export async function listManagedChannels(id: string) {
    const c = await readChannels(id);
    return Object.values(c.managed ?? {});
}

export async function addManagedChannel(id: string, entry: { key?: string; label: string; channelId: string }) {
    return writeChannels(id, (c: any) => {
        const next = deepClone(c);
        next.managed = next.managed ?? {};
        const key = entry.key ?? generateKey(entry.label, Object.keys(next.managed));
        next.managed[key] = { id: key, label: entry.label, channelId: entry.channelId };
        return next;
    });
}

export async function updateManagedChannel(id: string, identifier: string, patch: Partial<{ label: string; channelId: string }>) {
    return writeChannels(id, (c: any) => {
        const next = deepClone(c);
        const k = resolveManagedKey(next.managed ?? {}, identifier);
        if (!k) return next;
        next.managed[k] = { ...next.managed[k], ...patch };
        return next;
    });
}

export async function removeManagedChannel(id: string, identifier: string) {
    return writeChannels(id, (c: any) => {
        const next = deepClone(c);
        const k = resolveManagedKey(next.managed ?? {}, identifier);
        if (k) delete next.managed[k];
        return next;
    });
}

export async function getRole(id: string, key: string) {
    const r = await readRoles(id);
    return r?.[key] ?? null;
}

export async function upsertRole(id: string, key: string, patch: any) {
    return writeRoles(id, (r: any) => ({ ...r, [key]: { ...(r?.[key] ?? {}), ...patch, updatedAt: new Date().toISOString() } }));
}

export async function removeRole(id: string, key: string) {
    return writeRoles(id, (r: any) => {
        if (!r?.[key]) return r;
        const { [key]: _omit, ...rest } = r;
        return rest;
    });
}

// ----------------------------- AUTOROLE (DB) -----------------------------
function toAutoRoleTrigger(row: AutoRoleRuleRow): AutoRoleRule["trigger"] {
    const baseArgs = (row.args ?? {}) as Record<string, unknown>;
    switch (row.triggerType) {
        case "MESSAGE_REACT_ANY":
            return { type: "MESSAGE_REACT_ANY", args: {} };
        case "REACT_SPECIFIC":
            return {
                type: "REACT_SPECIFIC",
                args: {
                    messageId: String(baseArgs.messageId ?? ""),
                    emojiKey: String(baseArgs.emojiKey ?? ""),
                },
            };
        case "REACTED_THRESHOLD":
            return {
                type: "REACTED_THRESHOLD",
                args: {
                    emojiKey: String(baseArgs.emojiKey ?? ""),
                    count: Number.parseInt(String(baseArgs.count ?? "0"), 10),
                },
            };
        case "REPUTATION_THRESHOLD":
            return {
                type: "REPUTATION_THRESHOLD",
                args: {
                    minRep: Number.parseInt(String(baseArgs.minRep ?? "0"), 10),
                },
            };
        default:
            return { type: "MESSAGE_REACT_ANY", args: {} };
    }
}

function toAutoRoleRule(row: AutoRoleRuleRow): AutoRoleRule {
    return {
        guildId: row.guildId,
        name: row.name,
        trigger: toAutoRoleTrigger(row),
        roleId: row.roleId,
        durationMs: row.durationMs ?? null,
        enabled: row.enabled,
        createdBy: row.createdBy ?? null,
        createdAt: row.createdAt ?? new Date(0),
        updatedAt: row.updatedAt ?? new Date(0),
    };
}

function toAutoRoleGrant(row: AutoRoleGrant): AutoRoleGrantReason {
    return {
        guildId: row.guildId,
        userId: row.userId,
        roleId: row.roleId,
        ruleName: row.ruleName,
        type: row.type,
        expiresAt: row.expiresAt ?? null,
        createdAt: row.createdAt ?? new Date(0),
        updatedAt: row.updatedAt ?? new Date(0),
    };
}

function toAutoRoleTally(row: AutoRoleReactionTally): ReactionTallySnapshot {
    return {
        key: {
            guildId: row.guildId,
            messageId: row.messageId,
            emojiKey: row.emojiKey,
        },
        authorId: row.authorId,
        count: row.count ?? 0,
        updatedAt: row.updatedAt ?? new Date(0),
    };
}

export async function autoRoleFetchRulesByGuild(guildId: string): Promise<AutoRoleRule[]> {
    const rows = await db.select().from(autoRoleRules).where(eq(autoRoleRules.guildId, guildId));
    return rows.map(toAutoRoleRule);
}

export async function autoRoleFetchAllRules(): Promise<AutoRoleRule[]> {
    const rows = await db.select().from(autoRoleRules);
    return rows.map(toAutoRoleRule);
}

export async function autoRoleFetchRule(guildId: string, name: string): Promise<AutoRoleRule | null> {
    const [row] = await db
        .select()
        .from(autoRoleRules)
        .where(and(eq(autoRoleRules.guildId, guildId), eq(autoRoleRules.name, name)))
        .limit(1);
    return row ? toAutoRoleRule(row) : null;
}

export async function autoRoleListRuleNames(guildId: string): Promise<string[]> {
    const rows = await db
        .select({ name: autoRoleRules.name })
        .from(autoRoleRules)
        .where(eq(autoRoleRules.guildId, guildId));
    return rows.map((row) => row.name);
}

export async function autoRoleInsertRule(input: CreateAutoRoleRuleInput): Promise<AutoRoleRule> {
    const [row] = await db
        .insert(autoRoleRules)
        .values({
            guildId: input.guildId,
            name: input.name,
            triggerType: input.trigger.type,
            args: input.trigger.args,
            roleId: input.roleId,
            durationMs: input.durationMs ?? null,
            enabled: input.enabled ?? true,
            createdBy: input.createdBy ?? null,
        })
        .returning();

    return toAutoRoleRule(row);
}

export async function autoRoleUpdateRuleEnabled({ guildId, name, enabled }: UpdateRuleEnabledInput): Promise<AutoRoleRule | null> {
    const [row] = await db
        .update(autoRoleRules)
        .set({
            enabled,
            updatedAt: sql`now()`,
        })
        .where(and(eq(autoRoleRules.guildId, guildId), eq(autoRoleRules.name, name)))
        .returning();

    return row ? toAutoRoleRule(row) : null;
}

export async function autoRoleDeleteRule(input: DeleteRuleInput): Promise<boolean> {
    const res = await db
        .delete(autoRoleRules)
        .where(and(eq(autoRoleRules.guildId, input.guildId), eq(autoRoleRules.name, input.name)));
    return (res.rowCount ?? 0) > 0;
}

export async function autoRoleUpsertGrant(input: GrantByRuleInput): Promise<AutoRoleGrantReason> {
    const [row] = await db
        .insert(autoRoleGrants)
        .values({
            guildId: input.guildId,
            userId: input.userId,
            roleId: input.roleId,
            ruleName: input.ruleName,
            type: input.type,
            expiresAt: input.expiresAt,
        })
        .onConflictDoUpdate({
            target: [
                autoRoleGrants.guildId,
                autoRoleGrants.userId,
                autoRoleGrants.roleId,
                autoRoleGrants.ruleName,
                autoRoleGrants.type,
            ],
            set: {
                expiresAt: input.expiresAt,
                updatedAt: sql`now()`,
            },
        })
        .returning();

    return toAutoRoleGrant(row);
}

export async function autoRoleDeleteGrant(input: RevokeByRuleInput): Promise<boolean> {
    const res = await db
        .delete(autoRoleGrants)
        .where(
            and(
                eq(autoRoleGrants.guildId, input.guildId),
                eq(autoRoleGrants.userId, input.userId),
                eq(autoRoleGrants.roleId, input.roleId),
                eq(autoRoleGrants.ruleName, input.ruleName),
                eq(autoRoleGrants.type, input.type),
            ),
        );
    return (res.rowCount ?? 0) > 0;
}

export async function autoRoleListReasonsForMemberRole(guildId: string, userId: string, roleId: string): Promise<AutoRoleGrantReason[]> {
    const rows = await db
        .select()
        .from(autoRoleGrants)
        .where(and(eq(autoRoleGrants.guildId, guildId), eq(autoRoleGrants.userId, userId), eq(autoRoleGrants.roleId, roleId)));
    return rows.map(toAutoRoleGrant);
}

export async function autoRoleListReasonsForRule(guildId: string, ruleName: string): Promise<AutoRoleGrantReason[]> {
    const rows = await db
        .select()
        .from(autoRoleGrants)
        .where(and(eq(autoRoleGrants.guildId, guildId), eq(autoRoleGrants.ruleName, ruleName)));
    return rows.map(toAutoRoleGrant);
}

export async function autoRoleCountReasonsForRole(guildId: string, userId: string, roleId: string): Promise<number> {
    const [row] = await db
        .select({ total: count() })
        .from(autoRoleGrants)
        .where(and(eq(autoRoleGrants.guildId, guildId), eq(autoRoleGrants.userId, userId), eq(autoRoleGrants.roleId, roleId)));
    return Number(row?.total ?? 0);
}

export async function autoRolePurgeGrantsForRule(guildId: string, ruleName: string): Promise<number> {
    const res = await db
        .delete(autoRoleGrants)
        .where(and(eq(autoRoleGrants.guildId, guildId), eq(autoRoleGrants.ruleName, ruleName)));
    return res.rowCount ?? 0;
}

export async function autoRolePurgeGrantsForGuildRole(guildId: string, roleId: string): Promise<number> {
    const res = await db.delete(autoRoleGrants).where(and(eq(autoRoleGrants.guildId, guildId), eq(autoRoleGrants.roleId, roleId)));
    return res.rowCount ?? 0;
}

export async function autoRoleFindGrant(
    guildId: string,
    userId: string,
    roleId: string,
    ruleName: string,
    type: AutoRoleGrant["type"],
): Promise<AutoRoleGrantReason | null> {
    const [row] = await db
        .select()
        .from(autoRoleGrants)
        .where(
            and(
                eq(autoRoleGrants.guildId, guildId),
                eq(autoRoleGrants.userId, userId),
                eq(autoRoleGrants.roleId, roleId),
                eq(autoRoleGrants.ruleName, ruleName),
                eq(autoRoleGrants.type, type),
            ),
        )
        .limit(1);
    return row ? toAutoRoleGrant(row) : null;
}

export async function autoRoleListDueTimedGrants(reference: Date): Promise<AutoRoleGrantReason[]> {
    const rows = await db
        .select()
        .from(autoRoleGrants)
        .where(and(eq(autoRoleGrants.type, "TIMED"), isNotNull(autoRoleGrants.expiresAt), lte(autoRoleGrants.expiresAt, reference)));
    return rows.map(toAutoRoleGrant);
}

export async function autoRoleIncrementReactionTally(key: ReactionTallyKey, authorId: string): Promise<ReactionTallySnapshot> {
    const [row] = await db
        .insert(autoRoleReactionTallies)
        .values({
            guildId: key.guildId,
            messageId: key.messageId,
            emojiKey: key.emojiKey,
            authorId,
            count: 1,
        })
        .onConflictDoUpdate({
            target: [autoRoleReactionTallies.guildId, autoRoleReactionTallies.messageId, autoRoleReactionTallies.emojiKey],
            set: {
                authorId,
                count: sql`${autoRoleReactionTallies.count} + 1`,
                updatedAt: sql`now()`,
            },
        })
        .returning();

    return toAutoRoleTally(row);
}

export async function autoRoleDecrementReactionTally(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    const [row] = await db
        .update(autoRoleReactionTallies)
        .set({
            count: sql`GREATEST(${autoRoleReactionTallies.count} - 1, 0)`,
            updatedAt: sql`now()`,
        })
        .where(
            and(
                eq(autoRoleReactionTallies.guildId, key.guildId),
                eq(autoRoleReactionTallies.messageId, key.messageId),
                eq(autoRoleReactionTallies.emojiKey, key.emojiKey),
            ),
        )
        .returning();

    if (!row) return null;

    if ((row.count ?? 0) === 0) {
        await db
            .delete(autoRoleReactionTallies)
            .where(
                and(
                    eq(autoRoleReactionTallies.guildId, key.guildId),
                    eq(autoRoleReactionTallies.messageId, key.messageId),
                    eq(autoRoleReactionTallies.emojiKey, key.emojiKey),
                ),
            );
    }

    return toAutoRoleTally({
        ...row,
        count: Math.max(row.count ?? 0, 0),
    });
}

export async function autoRoleReadReactionTally(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    const [row] = await db
        .select()
        .from(autoRoleReactionTallies)
        .where(
            and(
                eq(autoRoleReactionTallies.guildId, key.guildId),
                eq(autoRoleReactionTallies.messageId, key.messageId),
                eq(autoRoleReactionTallies.emojiKey, key.emojiKey),
            ),
        )
        .limit(1);
    return row ? toAutoRoleTally(row) : null;
}

export async function autoRoleDeleteReactionTally(key: ReactionTallyKey): Promise<boolean> {
    const res = await db
        .delete(autoRoleReactionTallies)
        .where(
            and(
                eq(autoRoleReactionTallies.guildId, key.guildId),
                eq(autoRoleReactionTallies.messageId, key.messageId),
                eq(autoRoleReactionTallies.emojiKey, key.emojiKey),
            ),
        );
    return (res.rowCount ?? 0) > 0;
}

export async function autoRoleDeleteTalliesForMessage(guildId: string, messageId: string): Promise<number> {
    const res = await db
        .delete(autoRoleReactionTallies)
        .where(and(eq(autoRoleReactionTallies.guildId, guildId), eq(autoRoleReactionTallies.messageId, messageId)));
    return res.rowCount ?? 0;
}

export async function autoRoleListTalliesForMessage(guildId: string, messageId: string): Promise<ReactionTallySnapshot[]> {
    const rows = await db
        .select()
        .from(autoRoleReactionTallies)
        .where(and(eq(autoRoleReactionTallies.guildId, guildId), eq(autoRoleReactionTallies.messageId, messageId)));
    return rows.map(toAutoRoleTally);
}

// ----------------------------- AUTOROLE (SERVICE) -----------------------------
interface AutoroleGrantContext {
    client: UsingClient;
    rule: AutoRoleRule;
    userId: string;
    reason: string;
}

interface AutoroleRevokeContext {
    client: UsingClient;
    rule: AutoRoleRule;
    userId: string;
    reason: string;
    grantType: "LIVE" | "TIMED";
}

export async function loadRulesIntoCache(): Promise<void> {
    const all = await autoRoleFetchAllRules();
    const byGuild = new Map<string, AutoRoleRule[]>();

    for (const rule of all) {
        const list = byGuild.get(rule.guildId) ?? [];
        list.push(rule);
        byGuild.set(rule.guildId, list);
    }

    for (const [guildId, rules] of byGuild.entries()) {
        const enabledOnly = rules.filter((rule) => rule.enabled);
        setGuildRules(guildId, enabledOnly);
    }
}

export async function refreshGuildRules(guildId: string): Promise<AutoRoleRule[]> {
    const rules = await autoRoleFetchRulesByGuild(guildId);
    const enabledOnly = rules.filter((rule) => rule.enabled);
    setGuildRules(guildId, enabledOnly);
    return rules;
}

export async function createRule(input: CreateAutoRoleRuleInput): Promise<AutoRoleRule> {
    const rule = await autoRoleInsertRule(input);
    await refreshGuildRules(rule.guildId);
    return rule;
}

export async function enableRule(guildId: string, name: string): Promise<AutoRoleRule | null> {
    const rule = await autoRoleUpdateRuleEnabled({
        guildId,
        name,
        enabled: true,
    });
    if (rule?.enabled) {
        upsertRuleInCache(rule);
    }
    return rule;
}

export async function disableRule(guildId: string, name: string): Promise<AutoRoleRule | null> {
    const rule = await autoRoleUpdateRuleEnabled({
        guildId,
        name,
        enabled: false,
    });
    if (rule && !rule.enabled) {
        removeRuleFromCache(guildId, name);
    }
    return rule;
}

export async function deleteRule(guildId: string, name: string): Promise<boolean> {
    const deleted = await autoRoleDeleteRule({ guildId, name });
    if (deleted) {
        removeRuleFromCache(guildId, name);
    }
    return deleted;
}

export async function grantByRule({ client, rule, userId, reason }: AutoroleGrantContext): Promise<AutoRoleGrantReason> {
    const grantType = isLiveRule(rule.durationMs) ? "LIVE" : "TIMED";

    const existingGrant = await autoRoleFindGrant(rule.guildId, userId, rule.roleId, rule.name, grantType);
    const existingReasons = await autoRoleCountReasonsForRole(rule.guildId, userId, rule.roleId);

    let expiresAt: Date | null = null;
    if (grantType === "TIMED") {
        const now = Date.now();
        const base = existingGrant?.expiresAt?.getTime() ?? now;
        const duration = rule.durationMs ?? 0;
        expiresAt = new Date(Math.max(base, now) + duration);
    }

    const stored = await autoRoleUpsertGrant({
        guildId: rule.guildId,
        userId,
        roleId: rule.roleId,
        ruleName: rule.name,
        type: grantType,
        expiresAt,
    });

    const isNewReason = !existingGrant;
    const shouldGrantRole = isNewReason && existingReasons === 0;

    if (shouldGrantRole) {
        await enqueueRoleGrant(client, {
            guildId: rule.guildId,
            userId,
            roleId: rule.roleId,
            reason,
        });
        await notifyRoleGranted(client, rule, userId);
    }

    client.logger?.debug?.("[autorole] grant by rule", {
        guildId: rule.guildId,
        ruleName: rule.name,
        targetUserId: userId,
        roleId: rule.roleId,
        type: grantType,
        expiresAt: stored.expiresAt?.toISOString() ?? null,
        reason,
    });

    return stored;
}

export async function revokeByRule({ client, rule, userId, reason, grantType }: AutoroleRevokeContext): Promise<boolean> {
    const existing = await autoRoleFindGrant(rule.guildId, userId, rule.roleId, rule.name, grantType);
    if (!existing) return false;

    const removed = await autoRoleDeleteGrant({
        guildId: rule.guildId,
        userId,
        roleId: rule.roleId,
        ruleName: rule.name,
        type: grantType,
    });
    if (!removed) return false;

    const remaining = await autoRoleCountReasonsForRole(rule.guildId, userId, rule.roleId);
    if (remaining === 0) {
        await enqueueRoleRevoke(client, {
            guildId: rule.guildId,
            userId,
            roleId: rule.roleId,
            reason,
        });
    }

    client.logger?.debug?.("[autorole] revoke by rule", {
        guildId: rule.guildId,
        ruleName: rule.name,
        targetUserId: userId,
        roleId: rule.roleId,
        type: grantType,
        reason,
    });

    return true;
}

export async function purgeRule(client: UsingClient, guildId: string, ruleName: string): Promise<{ removedGrants: number; roleRevocations: number }> {
    const grants = await autoRoleListReasonsForRule(guildId, ruleName);
    if (grants.length === 0) {
        return { removedGrants: 0, roleRevocations: 0 };
    }

    const removed = await autoRolePurgeGrantsForRule(guildId, ruleName);

    const uniquePairs = new Map<string, { userId: string; roleId: string }>();
    for (const grant of grants) {
        const key = `${grant.userId}:${grant.roleId}`;
        if (!uniquePairs.has(key)) {
            uniquePairs.set(key, {
                userId: grant.userId,
                roleId: grant.roleId,
            });
        }
    }

    let revocations = 0;
    for (const pair of uniquePairs.values()) {
        const remaining = await autoRoleCountReasonsForRole(guildId, pair.userId, pair.roleId);
        if (remaining === 0) {
            revocations += 1;
            await enqueueRoleRevoke(client, {
                guildId,
                userId: pair.userId,
                roleId: pair.roleId,
                reason: `autorole:${ruleName}:purge`,
            });
        }
    }

    return {
        removedGrants: removed,
        roleRevocations: revocations,
    };
}

export async function incrementReactionTally(key: ReactionTallyKey, authorId: string): Promise<ReactionTallySnapshot> {
    const snapshot = await autoRoleIncrementReactionTally(key, authorId);
    setTally(snapshot);
    return snapshot;
}

export async function decrementReactionTally(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    const snapshot = await autoRoleDecrementReactionTally(key);
    if (!snapshot) return null;
    if (snapshot.count > 0) {
        setTally(snapshot);
    } else {
        deleteTally(key);
    }
    return snapshot;
}

export async function readReactionTally(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    const cached = getTally(key);
    if (cached) return cached;
    const fresh = await autoRoleReadReactionTally(key);
    if (fresh) setTally(fresh);
    return fresh;
}

export async function removeReactionTally(key: ReactionTallyKey): Promise<void> {
    await autoRoleDeleteReactionTally(key);
    deleteTally(key);
}

export async function drainMessageState(
    guildId: string,
    messageId: string,
): Promise<{
    presence: ReactionPresenceKey[];
    tallies: ReactionTallySnapshot[];
}> {
    const presence = clearPresenceForMessage(guildId, messageId);
    const tallies = await autoRoleListTalliesForMessage(guildId, messageId);
    deleteTalliesForMessage(guildId, messageId);
    if (tallies.length > 0) {
        await autoRoleDeleteTalliesForMessage(guildId, messageId);
    }
    return { presence, tallies };
}

export function trackPresence(key: ReactionPresenceKey): void {
    markPresence(key);
}

export function clearTrackedPresence(key: ReactionPresenceKey): void {
    clearPresence(key);
}

async function notifyRoleGranted(client: UsingClient, rule: AutoRoleRule, userId: string): Promise<void> {
    try {
        const roleName = (await client.roles.fetch(rule.guildId, rule.roleId)).name;

        const guild = await client.guilds.fetch(rule.guildId).catch(() => null);
        const guildName = guild?.name ?? "el servidor";
        const duration = rule.durationMs ? formatMs(rule.durationMs, true) : null;

        const lines = [
            `**[${guildName}]** Has recibido el rol \`@${roleName}\`.`,
            duration ? `Duracion: ${duration}.` : "Duracion: condicional.",
        ];

        await client.users.write(userId, {
            content: lines.join("\n"),
            allowed_mentions: { parse: [] },
        });
    } catch (error) {
        client.logger?.debug?.("[autorole] failed to DM role grant notice", {
            guildId: rule.guildId,
            userId,
            roleId: rule.roleId,
            error,
        });
    }
}

// ----------------------------- UTILS -----------------------------
function generateKey(label: string, existingKeys: string[]) {
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
    let k = base || "key";
    let i = 1;
    while (existingKeys.includes(k)) k = `${base}-${i++}`;
    return k;
}

function resolveManagedKey(managed: Record<string, any>, identifier: string) {
    if (!managed) return null;
    if (managed[identifier]) return identifier;
    const asEntry = Object.entries(managed).find(([, v]) => v?.label === identifier);
    return asEntry ? asEntry[0] : null;
}


// Minimal action-key normalization so you don't end up with 5 spellings of the same thing.
const normAction = (k: string) => k.trim().toLowerCase().replace(/[\s-]+/g, "_");

// Ensure role record exists inside roles JSON without doing extra round-trips.
async function ensureRole(guildId: string, roleKey: string) {
    return writeRoles(guildId, (roles: any = {}) => {
        const ex = roles[roleKey] ?? {};
        roles[roleKey] = {
            ...ex,
            reach: ex.reach ?? {},   // overrides map
            limits: ex.limits ?? {}, // limits map
            updatedAt: new Date().toISOString(),
        };
        return roles;
    });
}

/* ===================== OVERRIDES ===================== */

export async function getRoleOverrides(guildId: string, roleKey: string) {
    const roles = await readRoles(guildId);
    return { ...(roles?.[roleKey]?.reach ?? {}) };
}

export async function setRoleOverride(
    guildId: string,
    roleKey: string,
    actionKey: string,
    override: any,           // e.g. "allow" | "deny" | config object — your call
    _db?: unknown,           // optional tx placeholder, ignored here
): Promise<void> {
    await writeRoles(guildId, (roles: any = {}) => {
        const k = normAction(actionKey);
        const ex = roles[roleKey] ?? {};
        const reach = { ...(ex.reach ?? {}) };
        reach[k] = override;
        roles[roleKey] = { ...ex, reach, updatedAt: new Date().toISOString() };
        return roles;
    });
}

export async function clearRoleOverride(
    guildId: string,
    roleKey: string,
    actionKey: string,
    _db?: unknown,
): Promise<boolean> {
    let removed = false;
    await writeRoles(guildId, (roles: any = {}) => {
        const ex = roles[roleKey];
        if (!ex?.reach) return roles;
        const k = normAction(actionKey);
        if (!(k in ex.reach)) return roles;
        const reach = { ...ex.reach };
        delete reach[k];
        removed = true;
        roles[roleKey] = { ...ex, reach, updatedAt: new Date().toISOString() };
        return roles;
    });
    return removed;
}

export async function resetRoleOverrides(
    guildId: string,
    roleKey: string,
    _db?: unknown,
): Promise<void> {
    await writeRoles(guildId, (roles: any = {}) => {
        const ex = roles[roleKey] ?? {};
        roles[roleKey] = { ...ex, reach: {}, updatedAt: new Date().toISOString() };
        return roles;
    });
}

/* ====================== LIMITS ======================= */

export async function getRoleLimits(guildId: string, roleKey: string) {
    const roles = await readRoles(guildId);
    return { ...(roles?.[roleKey]?.limits ?? {}) };
}

export async function setRoleLimit(
    guildId: string,
    roleKey: string,
    actionKey: string,
    limit: { limit: number; window?: string | null; windowSeconds?: number | null },
    _db?: unknown,
): Promise<void> {
    await writeRoles(guildId, (roles: any = {}) => {
        const k = normAction(actionKey);
        const ex = roles[roleKey] ?? {};
        const limits = { ...(ex.limits ?? {}) };
        limits[k] = {
            limit: limit.limit,
            window: limit.window ?? null,
            windowSeconds: limit.windowSeconds ?? null,
        };
        roles[roleKey] = { ...ex, limits, updatedAt: new Date().toISOString() };
        return roles;
    });
}

export async function clearRoleLimit(
    guildId: string,
    roleKey: string,
    actionKey: string,
    _db?: unknown,
): Promise<boolean> {
    let removed = false;
    await writeRoles(guildId, (roles: any = {}) => {
        const ex = roles[roleKey];
        if (!ex?.limits) return roles;
        const k = normAction(actionKey);
        if (!(k in ex.limits)) return roles;
        const limits = { ...ex.limits };
        delete limits[k];
        removed = true;
        roles[roleKey] = { ...ex, limits, updatedAt: new Date().toISOString() };
        return roles;
    });
    return removed;
}


// Create a role if missing without changing anything else.
// Useful before bulk-setting multiple overrides/limits in one place.
export async function ensureRoleExists(guildId: string, roleKey: string): Promise<void> {
    await ensureRole(guildId, roleKey);
}
