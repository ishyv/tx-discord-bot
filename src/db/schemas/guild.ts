/**
 * Zod schema for guild documents.
 * Purpose: single definition of guild shape/defaults to validate repo reads/writes.
 */
import { DEFAULT_GEMINI_MODEL, DEFAULT_PROVIDER_ID } from "@/services/ai";
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

const defaultGuildChannels = () => ({
  core: defaultCoreChannels(),
  managed: {},
  ticketMessageId: null,
  ticketHelperRoles: [],
  ticketCategoryId: null,
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
  core: z.record(z.string(), CoreChannelSchema.nullable()).catch(() => defaultCoreChannels()),
  managed: z.record(z.string(), ManagedChannelSchema).catch(() => ({})),
  ticketMessageId: z.string().nullable().catch(null),
  ticketHelperRoles: z.array(z.string()).catch(() => []),
  ticketCategoryId: z.string().nullable().catch(null),
});

export const GuildFeaturesSchema = z
  .record(z.string(), z.boolean())
  .catch(() => DEFAULT_GUILD_FEATURES);
export const GuildRolesSchema = z.record(z.string(), z.any()).catch(() => ({}));

export const ForumAutoReplySchema = z.object({
  forumIds: z.array(z.string()).catch(() => []),
});

export const AiConfigSchema = z.object({
  provider: z.string().catch(DEFAULT_PROVIDER_ID),
  model: z.string().catch(DEFAULT_GEMINI_MODEL),
});

export const GuildSchema = z.object({
  _id: z.string(),
  roles: GuildRolesSchema,
  channels: GuildChannelsSchema.catch(() => defaultGuildChannels()),
  pendingTickets: z.array(z.string()).catch(() => []),
  features: GuildFeaturesSchema,
  forumAutoReply: ForumAutoReplySchema.catch(() => ({ forumIds: [] })),
  ai: AiConfigSchema.catch(() => ({
    provider: "gemini",
    model: "gemini-2.5-flash",
  })),
  reputation: z
    .object({
      keywords: z.array(z.string()).catch(() => []),
    })
    .catch(() => ({ keywords: [] })),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Guild = z.infer<typeof GuildSchema>;
export type GuildChannelsRecord = z.infer<typeof GuildChannelsSchema>;
export type GuildFeaturesRecord = z.infer<typeof GuildFeaturesSchema>;
export type CoreChannelRecord = z.infer<typeof CoreChannelSchema>;
export type ManagedChannelRecord = z.infer<typeof ManagedChannelSchema>;
export type ForumAutoReplyRecord = z.infer<typeof ForumAutoReplySchema>;
export type AiConfigRecord = z.infer<typeof AiConfigSchema>;

