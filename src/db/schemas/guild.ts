/**
 * Zod schema for guild documents.
 * Purpose: single definition of guild shape/defaults to validate repo reads/writes.
 */
import { z } from "zod";

export enum Features {
  Tickets = "tickets",
  Automod = "automod",
  Autoroles = "autoroles",
  Warns = "warns",
  Roles = "roles",
  Reputation = "reputation",
  ReputationDetection = "reputationDetection",
  Tops = "tops",
  Suggest = "suggest",
  Economy = "economy",
  Game = "game",
}

export type RoleCapabilityKey = string;
export type RoleCommandOverride = "inherit" | "allow" | "deny";
export type RoleCommandOverrideMap = Record<RoleCapabilityKey, RoleCommandOverride>;
export type LimitWindow = `${number}${"m" | "h" | "d"}`;

export interface RoleLimitRecord {
  limit: number;
  window: LimitWindow | null;
  windowSeconds?: number | null;
}

export type RoleLimitMap = Partial<Record<RoleCapabilityKey, RoleLimitRecord>>;

export interface GuildRoleRecord {
  label: string;
  discordRoleId: string | null;
  limits: RoleLimitMap;
  reach: RoleCommandOverrideMap;
  updatedBy: string | null;
  updatedAt: string | null;
}

export type GuildRolesRecord = Record<string, GuildRoleRecord>;

export const DEFAULT_GUILD_FEATURES: Readonly<Record<Features, boolean>> = Object.freeze(
  Object.values(Features).reduce(
    (acc, key) => ({ ...acc, [key]: true }),
    {} as Record<Features, boolean>,
  ),
);

const defaultCoreChannels = () => ({
  welcome: null,
  goodbye: null,
  logs: null,
  reports: null,
  suggestions: null,
  tickets: null,
});

export const CoreChannelSchema = z.object({
  channelId: z.string(),
});

export const ManagedChannelSchema = z.object({
  id: z.string(),
  label: z.string(),
  channelId: z.string(),
});

export const GuildChannelsSchema = z.object({
  core: z.record(z.string(), CoreChannelSchema.nullable()).default(() => defaultCoreChannels()),
  managed: z.record(z.string(), ManagedChannelSchema).default(() => ({})),
  ticketMessageId: z.string().nullable().default(null),
  ticketHelperRoles: z.array(z.string()).default(() => []),
  ticketCategoryId: z.string().nullable().default(null),
});

export const GuildFeaturesSchema = z
  .record(z.string(), z.boolean())
  .default(() => DEFAULT_GUILD_FEATURES);
export const GuildRolesSchema = z.record(z.string(), z.any()).default(() => ({}));

export const GuildSchema = z.object({
  _id: z.string(),
  roles: GuildRolesSchema,
  channels: GuildChannelsSchema,
  pendingTickets: z.array(z.string()).default(() => []),
  features: GuildFeaturesSchema,
  reputation: z
    .object({
      keywords: z.array(z.string()).default(() => []),
    })
    .default(() => ({ keywords: [] })),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Guild = z.infer<typeof GuildSchema>;
export type GuildChannelsRecord = z.infer<typeof GuildChannelsSchema>;
export type GuildFeaturesRecord = z.infer<typeof GuildFeaturesSchema>;
export type CoreChannelRecord = z.infer<typeof CoreChannelSchema>;
export type ManagedChannelRecord = z.infer<typeof ManagedChannelSchema>;
