/**
 * Motivación: encapsular la reacción al evento "autorole" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
/**
 * Autorole listeners translate raw Discord events into repository updates and
 * scheduler operations.  The heavy lifting lives elsewhere; this layer focuses on
 * wiring payloads into the right helpers and applying guardrails around them.
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
import { getGuildRules } from "@/modules/autorole/cache";
import {
  normalizeEmojiKey,
  isLiveRule,
} from "@/modules/autorole/parsers";
import type { AutoRoleRule } from "@/modules/autorole/types";
import {
  AutoRoleGrantsRepo,
  AutoRoleRulesRepo,
  clearTrackedPresence,
  decrementReactionTally,
  disableRule,
  drainMessageState,
  grantByRule,
  incrementReactionTally,
  loadRulesIntoCache,
  revokeByRule,
  trackPresence,
} from "@/db/repositories";
import { startTimedGrantScheduler } from "@/systems/autorole/scheduler";
import { startAntiquityScheduler } from "@/systems/autorole/antiquity";
import { onGuildRoleDelete } from "@/events/hooks/guildRole";
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
const THRESHOLD_REASON = (ruleName: string) =>
  `autorole:${ruleName}:reacted_threshold`;
const SPECIFIC_REASON = (ruleName: string) =>
  `autorole:${ruleName}:react_specific`;
const ANY_REASON = (ruleName: string) =>
  `autorole:${ruleName}:react_any`;

onBotReady(async (_user, client) => {
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

    const featureEnabled = await isFeatureEnabled(guildId, Features.Autoroles);
    if (!featureEnabled) return;

    const userId = payload.userId;
    if (!userId) return;

    if (isBotUser(payload)) return;

    const emojiKey = normalizeEmojiKey(payload.emoji);
    if (!emojiKey) return;

    const cache = getGuildRules(guildId);

    // MESSAGE_REACT_ANY
    if (cache.anyReact.length) {
      for (const rule of cache.anyReact) {
        await grantByRule({
          client,
          rule,
          userId,
          reason: ANY_REASON(rule.name),
        });
      }
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
        await grantByRule({
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

      const key = {
        guildId,
        messageId: payload.messageId,
        emojiKey,
      };
      const tally = await incrementReactionTally(key, authorId);
      const next = tally.count;

      for (const rule of thresholdRules) {
        if (rule.trigger.type !== "REACTED_THRESHOLD") continue;
        const target = rule.trigger.args.count;
        if (next === target) {
          await grantByRule({
            client,
            rule,
            userId: authorId,
            reason: THRESHOLD_REASON(rule.name),
          });
        }
      }
    }
  } catch (error: unknown) {
    client.logger?.error?.("[autorole] reaction add failed", {
      error,
    });
  }
});

onMessageReactionRemove(async (payload: ReactionPayload, client: UsingClient) => {
  try {
    const guildId = payload.guildId;
    if (!guildId) return;

    const featureEnabled = await isFeatureEnabled(guildId, Features.Autoroles);
    if (!featureEnabled) return;

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
        await revokeByRule({
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
      const key = {
        guildId,
        messageId: payload.messageId,
        emojiKey,
      };
      const tally = await decrementReactionTally(key);
      if (!tally) return;
      const next = tally.count;
      const previous = next + 1;

      for (const rule of thresholdRules) {
        if (rule.trigger.type !== "REACTED_THRESHOLD") continue;
        if (!isLiveRule(rule.durationMs)) continue;
        const target = rule.trigger.args.count;
        if (previous >= target && next === target - 1) {
          await revokeByRule({
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
    client.logger?.error?.("[autorole] reaction remove failed", {
      error,
    });
  }
});

onMessageReactionRemoveAll(async (payload: ReactionRemoveAllPayload, client: UsingClient) => {
  await handleMessageStateReset(
    client,
    payload.guildId,
    payload.messageId,
    "removeAll",
  );
});

onMessageDelete(async (payload, client: UsingClient) => {
  const raw = payload as { guildId?: string; guild_id?: string };
  const guildId = raw.guildId ?? raw.guild_id;
  await handleMessageStateReset(
    client,
    guildId,
    payload.id,
    "messageDelete",
  );
});

onMessageDeleteBulk(async (payload, client: UsingClient) => {
  const raw = payload as {
    guildId?: string;
    guild_id?: string;
    ids?: string[];
  };
  const guildId = raw.guildId ?? raw.guild_id;
  if (!guildId) return;

  const featureEnabled = await isFeatureEnabled(guildId, Features.Autoroles);
  if (!featureEnabled) return;

  const ids: string[] = raw.ids ?? [];
  for (const id of ids) {
    await handleMessageStateReset(
      client,
      guildId,
      id,
      "messageDeleteBulk",
    );
  }
});
onGuildRoleDelete(async (payload, client: UsingClient) => {
  const raw = payload as {
    guildId?: string;
    guild_id?: string;
    roleId?: string;
    role_id?: string;
    role?: { id?: string };
  };
  const guildId = raw.guildId ?? raw.guild_id;
  const roleId = raw.roleId ?? raw.role_id ?? raw.role?.id;
  if (!guildId || !roleId) return;

  const featureEnabled = await isFeatureEnabled(guildId, Features.Autoroles);
  if (!featureEnabled) return;

  try {
    const rules: AutoRoleRule[] = await AutoRoleRulesRepo.fetchByGuild(guildId);
    const affected: AutoRoleRule[] = rules.filter((rule) => rule.enabled && rule.roleId === roleId);
    for (const rule of affected) {
      await disableRule(guildId, rule.name);
      client.logger?.info?.("[autorole] disabled rule after role deletion", {
        guildId,
        roleName: rule.name,
        roleId,
      });
    }
  } catch (error: unknown) {
    client.logger?.error?.("[autorole] failed to disable rules after role delete", {
      error,
      guildId,
      roleId,
    });
  }
});

async function handleMessageStateReset(
  client: UsingClient,
  guildId: string | undefined,
  messageId: string,
  reason: string,
) {
  if (!guildId) return;

  const featureEnabled = await isFeatureEnabled(guildId, Features.Autoroles);
  if (!featureEnabled) return;

  try {
    const cache = getGuildRules(guildId);
    let fallback: AutoRoleRule[] | null = null;

    const { presence, tallies } = await drainMessageState(
      guildId,
      messageId,
    );

    const resolveRules = async (
      matcher: (rule: AutoRoleRule) => boolean,
    ) => {
      let rules: AutoRoleRule[];
      if (fallback) {
        rules = fallback;
      } else {
        rules = await AutoRoleRulesRepo.fetchByGuild(guildId);
        fallback = rules;
      }
      return rules.filter(matcher);
    };

    // reactSpecific live revocations
    for (const entry of presence) {
      const key = `${entry.messageId}:${entry.emojiKey}`;
      const rules =
        cache.reactSpecific.get(key) ??
        (await resolveRules(
          (rule) =>
            rule.trigger.type === "REACT_SPECIFIC" &&
            rule.trigger.args.messageId === entry.messageId &&
            rule.trigger.args.emojiKey === entry.emojiKey,
        ));

      for (const rule of rules) {
        if (!isLiveRule(rule.durationMs)) continue;
        await revokeByRule({
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
      const rules =
        cache.reactedByEmoji.get(tally.key.emojiKey) ??
        (await resolveRules(
          (rule) =>
            rule.trigger.type === "REACTED_THRESHOLD" &&
            rule.trigger.args.emojiKey === tally.key.emojiKey,
        ));

      for (const rule of rules) {
        if (!isLiveRule(rule.durationMs)) continue;
        await revokeByRule({
          client,
          rule,
          userId: tally.authorId,
          reason: `${THRESHOLD_REASON(rule.name)}:${reason}`,
          grantType: "LIVE",
        });
      }
    }

    const allRules: AutoRoleRule[] =
      fallback ?? (await AutoRoleRulesRepo.fetchByGuild(guildId));
    const messageRules: AutoRoleRule[] = allRules.filter(
      (rule) =>
        rule.enabled &&
        rule.trigger.type === "REACT_SPECIFIC" &&
        rule.trigger.args.messageId === messageId,
    );

    for (const rule of messageRules) {
      await disableRule(guildId, rule.name);
      client.logger?.info?.("[autorole] disabled rule after message removal", {
        guildId,
        ruleName: rule.name,
        messageId,
      });
    }

    for (const rule of messageRules) {
      if (!isLiveRule(rule.durationMs)) continue;
      const grants = await AutoRoleGrantsRepo.listForRule(guildId, rule.name);
      for (const grant of grants) {
        if (grant.type !== "LIVE") continue;
        await revokeByRule({
          client,
          rule,
          userId: grant.userId,
          reason: `${SPECIFIC_REASON(rule.name)}:${reason}`,
          grantType: "LIVE",
        });
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
  const botFlag = payload.member?.user?.bot;
  return botFlag === true;
}

async function resolveMessageAuthorId(
  payload: ReactionPayload,
  client: UsingClient,
): Promise<string | null> {
  if (payload.messageAuthorId) {
    return payload.messageAuthorId;
  }

  try {
    const message = await client.messages.fetch(
      payload.messageId,
      payload.channelId,
    );
    return message?.author?.id ?? null;
  } catch (error: unknown) {
    client.logger?.warn?.("[autorole] failed to resolve message author", {
      error,
      messageId: payload.messageId,
      channelId: payload.channelId,
    });
    return null;
  }
}

