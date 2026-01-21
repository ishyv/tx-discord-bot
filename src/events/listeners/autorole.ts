/**
 * Autorole Listener
 * 
 * Orquestra el flujo de eventos de Discord y los mapea a lógica de Autorole.
 */

import type { UsingClient } from "seyfert";

import { onBotReady } from "@/events/hooks/botReady";
import {
  onMessageReactionAdd,
  onMessageReactionRemove,
  onMessageReactionRemoveAll,
} from "@/events/hooks/messageReaction";
import {
  onMessageDelete,
  onMessageDeleteBulk,
} from "@/events/hooks/messageDelete";
import { onGuildRoleDelete } from "@/events/hooks/guildRole";

import {
  AutoroleService,
  AutoRoleRulesStore,
  AutoRoleGrantsStore,
  getGuildRules,
  normalizeEmojiKey,
  isLiveRule,
  loadRulesIntoCache,
  startTimedGrantScheduler,
  startAntiquityScheduler,
  autoroleKeys,
  markPresence as trackPresence,
  clearPresence as clearTrackedPresence,
  ensureAutoroleIndexes,
  purgeInvalidAutoroleDocs,
} from "@/modules/autorole";

import { isFeatureEnabled, Features } from "@/modules/features";

interface ReactionPayload {
  guildId?: string;
  messageId: string;
  channelId: string;
  userId: string;
  emoji: { id: string | null; name: string | null };
  member?: {
    user: { bot?: boolean };
  };
  messageAuthorId?: string;
}

interface ReactionRemoveAllPayload {
  guildId?: string;
  messageId: string;
}

const THRESHOLD_REASON = (ruleName: string) => `autorole:${ruleName}:reacted_threshold`;
const SPECIFIC_REASON = (ruleName: string) => `autorole:${ruleName}:react_specific`;
const ANY_REASON = (ruleName: string) => `autorole:${ruleName}:react_any`;

onBotReady(async (_user, client) => {
  await ensureAutoroleIndexes().catch(() => undefined);
  await purgeInvalidAutoroleDocs().catch(() => undefined);
  await loadRulesIntoCache().catch((error) => {
    client.logger?.error?.("[autorole] failed to load rules", { error });
  });
  startTimedGrantScheduler(client as UsingClient);
  startAntiquityScheduler(client as UsingClient);
});

onMessageReactionAdd(async (payload: ReactionPayload, client: UsingClient) => {
  try {
    const guildId = payload.guildId;
    if (!guildId) return;

    if (!(await isFeatureEnabled(guildId, Features.Autoroles))) return;

    const userId = payload.userId;
    if (!userId || isBotUser(payload)) return;

    const emojiKey = normalizeEmojiKey(payload.emoji);
    if (!emojiKey) return;

    const cache = getGuildRules(guildId);

    // MESSAGE_REACT_ANY
    for (const rule of cache.anyReact) {
      await AutoroleService.grantByRule({
        client,
        rule,
        userId,
        reason: ANY_REASON(rule.name),
      });
    }

    // REACT_SPECIFIC
    const specificKey = `${payload.messageId}:${emojiKey}`;
    const specificRules = cache.reactSpecific.get(specificKey) ?? [];
    if (specificRules.length) {
      trackPresence({
        guildId,
        messageId: payload.messageId,
        emojiKey,
        userId,
      });

      for (const rule of specificRules) {
        await AutoroleService.grantByRule({
          client,
          rule,
          userId,
          reason: SPECIFIC_REASON(rule.name),
        });
      }
    }

    // REACTED_THRESHOLD
    const thresholdRules = cache.reactedByEmoji.get(emojiKey) ?? [];
    if (thresholdRules.length) {
      const authorId = await resolveMessageAuthorId(payload, client);
      if (!authorId) return;

      const tally = await AutoroleService.incrementReactionTally({
        guildId,
        messageId: payload.messageId,
        emojiKey,
      }, authorId);

      const next = tally.count;

      for (const rule of thresholdRules) {
        if (rule.trigger.type !== "REACTED_THRESHOLD") continue;
        const target = rule.trigger.args.count;
        if (next === target) {
          await AutoroleService.grantByRule({
            client,
            rule,
            userId: authorId,
            reason: THRESHOLD_REASON(rule.name),
          });
        }
      }
    }
  } catch (error: unknown) {
    client.logger?.error?.("[autorole] reaction add failed", { error });
  }
});

onMessageReactionRemove(async (payload: ReactionPayload, client: UsingClient) => {
  try {
    const guildId = payload.guildId;
    if (!guildId) return;

    if (!(await isFeatureEnabled(guildId, Features.Autoroles))) return;

    const userId = payload.userId;
    if (!userId) return;

    const emojiKey = normalizeEmojiKey(payload.emoji);
    if (!emojiKey) return;

    const cache = getGuildRules(guildId);

    // REACT_SPECIFIC
    const specificKey = `${payload.messageId}:${emojiKey}`;
    const specificRules = cache.reactSpecific.get(specificKey) ?? [];
    if (specificRules.length) {
      clearTrackedPresence({
        guildId,
        messageId: payload.messageId,
        emojiKey,
        userId,
      });

      for (const rule of specificRules) {
        if (!isLiveRule(rule.durationMs)) continue;
        await AutoroleService.revokeByRule({
          client,
          rule,
          userId,
          reason: `${SPECIFIC_REASON(rule.name)}:remove`,
          grantType: "LIVE",
        });
      }
    }

    // REACTED_THRESHOLD
    const thresholdRules = cache.reactedByEmoji.get(emojiKey) ?? [];
    if (thresholdRules.length) {
      const tally = await AutoroleService.decrementReactionTally({
        guildId,
        messageId: payload.messageId,
        emojiKey,
      });
      if (!tally) return;

      const next = tally.count;
      const previous = next + 1;

      for (const rule of thresholdRules) {
        if (rule.trigger.type !== "REACTED_THRESHOLD") continue;
        if (!isLiveRule(rule.durationMs)) continue;
        const target = rule.trigger.args.count;
        if (previous >= target && next === target - 1) {
          await AutoroleService.revokeByRule({
            client,
            rule,
            userId: tally.authorId,
            reason: `${THRESHOLD_REASON(rule.name)}:remove`,
            grantType: "LIVE",
          });
        }
      }
    }
  } catch (error: unknown) {
    client.logger?.error?.("[autorole] reaction remove failed", { error });
  }
});

onMessageReactionRemoveAll(async (payload: ReactionRemoveAllPayload, client: UsingClient) => {
  await handleMessageStateReset(client, payload.guildId, payload.messageId, "removeAll");
});

onMessageDelete(async (payload, client: UsingClient) => {
  const raw = payload as { guildId?: string; guild_id?: string };
  const guildId = raw.guildId ?? raw.guild_id;
  await handleMessageStateReset(client, guildId, payload.id, "messageDelete");
});

onMessageDeleteBulk(async (payload, client: UsingClient) => {
  const raw = payload as { guildId?: string; guild_id?: string; ids?: string[] };
  const guildId = raw.guildId ?? raw.guild_id;
  if (!guildId) return;

  if (!(await isFeatureEnabled(guildId, Features.Autoroles))) return;

  const ids: string[] = raw.ids ?? [];
  for (const id of ids) {
    await handleMessageStateReset(client, guildId, id, "messageDeleteBulk");
  }
});

onGuildRoleDelete(async (payload, client: UsingClient) => {
  const raw = payload as { guildId?: string; guild_id?: string; roleId?: string; role_id?: string; role?: { id?: string } };
  const guildId = raw.guildId ?? raw.guild_id;
  const roleId = raw.roleId ?? raw.role_id ?? raw.role?.id;
  if (!guildId || !roleId) return;

  if (!(await isFeatureEnabled(guildId, Features.Autoroles))) return;

  try {
    const rulesRes = await AutoRoleRulesStore.find({ guildId });
    if (rulesRes.isErr()) return;

    const affected = rulesRes.unwrap().filter((rule) => rule.enabled && rule.roleId === roleId);
    for (const rule of affected) {
      // Logic to disable rule should be in service or store
      await AutoRoleRulesStore.updatePaths(autoroleKeys.rule(guildId, rule.name), { enabled: false });
      client.logger?.info?.("[autorole] disabled rule after role deletion", {
        guildId,
        roleName: rule.name,
        roleId,
      });
    }
  } catch (error: unknown) {
    client.logger?.error?.("[autorole] failed to disable rules after role delete", { error, guildId, roleId });
  }
});

async function handleMessageStateReset(
  client: UsingClient,
  guildId: string | undefined,
  messageId: string,
  reason: string,
) {
  if (!guildId) return;
  if (!(await isFeatureEnabled(guildId, Features.Autoroles))) return;

  try {
    const cache = getGuildRules(guildId);
    const { presence, tallies } = await AutoroleService.drainMessageState(guildId, messageId);

    const rulesRes = await AutoRoleRulesStore.find({ guildId });
    if (rulesRes.isErr()) return;
    const allRules = rulesRes.unwrap();

    // reactSpecific live revocations
    for (const entry of presence) {
      const key = `${entry.messageId}:${entry.emojiKey}`;
      const rules = cache.reactSpecific.get(key) ?? allRules.filter(r =>
        r.trigger.type === "REACT_SPECIFIC" &&
        r.trigger.args.messageId === entry.messageId &&
        r.trigger.args.emojiKey === entry.emojiKey
      );

      for (const rule of rules) {
        if (!isLiveRule(rule.durationMs)) continue;
        await AutoroleService.revokeByRule({
          client,
          rule,
          userId: entry.userId,
          reason: `${SPECIFIC_REASON(rule.name)}:${reason}`,
          grantType: "LIVE",
        });
      }
    }

    // reacted threshold live revocations
    for (const tally of tallies) {
      const rules = cache.reactedByEmoji.get(tally.emojiKey) ?? allRules.filter(r =>
        r.trigger.type === "REACTED_THRESHOLD" &&
        r.trigger.args.emojiKey === tally.emojiKey
      );

      for (const rule of rules) {
        if (!isLiveRule(rule.durationMs)) continue;
        await AutoroleService.revokeByRule({
          client,
          rule,
          userId: tally.authorId,
          reason: `${THRESHOLD_REASON(rule.name)}:${reason}`,
          grantType: "LIVE",
        });
      }
    }

    const messageRules = allRules.filter(
      (rule) =>
        rule.enabled &&
        rule.trigger.type === "REACT_SPECIFIC" &&
        rule.trigger.args.messageId === messageId,
    );

    for (const rule of messageRules) {
      await AutoRoleRulesStore.updatePaths(autoroleKeys.rule(guildId, rule.name), { enabled: false });

      if (isLiveRule(rule.durationMs)) {
        const grantsRes = await AutoRoleGrantsStore.find({ guildId, ruleName: rule.name });
        if (grantsRes.isOk()) {
          for (const grant of grantsRes.unwrap()) {
            if (grant.type !== "LIVE") continue;
            await AutoroleService.revokeByRule({
              client,
              rule,
              userId: grant.userId,
              reason: `${SPECIFIC_REASON(rule.name)}:${reason}`,
              grantType: "LIVE",
            });
          }
        }
      }
    }
  } catch (error: unknown) {
    client.logger?.error?.("[autorole] failed to reset message state", {
      error,
      context: { guildId, messageId, reason },
    });
  }
}

function isBotUser(payload: ReactionPayload): boolean {
  return payload.member?.user?.bot === true;
}

async function resolveMessageAuthorId(
  payload: ReactionPayload,
  client: UsingClient,
): Promise<string | null> {
  if (payload.messageAuthorId) return payload.messageAuthorId;
  try {
    const message = await client.messages.fetch(payload.messageId, payload.channelId);
    return message?.author?.id ?? null;
  } catch {
    return null;
  }
}
