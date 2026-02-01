import { AutoroleService } from "@/modules/autorole";
import {
  AutoRoleTalliesStore,
  autoroleKeys,
} from "@/modules/autorole/data/store";
import {
  clearPresence,
  deleteTally,
  loadRulesIntoCache as loadRulesIntoCacheFromCache,
  refreshGuildRules as refreshGuildRulesFromCache,
  setTally,
  markPresence,
} from "@/modules/autorole/cache";
import type {
  ReactionPresenceKey,
  ReactionTallyKey,
  ReactionTallySnapshot,
} from "@/modules/autorole/domain/types";

const buildTallyId = (key: ReactionTallyKey) =>
  autoroleKeys.tally(key.guildId, key.messageId, key.emojiKey);

export const trackPresence = (key: ReactionPresenceKey) => markPresence(key);
export const clearTrackedPresence = (key: ReactionPresenceKey) =>
  clearPresence(key);

export const createRule = (
  input: Parameters<typeof AutoroleService.createRule>[0],
) => AutoroleService.createRule(input);

export const deleteRule = (guildId: string, name: string) =>
  AutoroleService.deleteRule(guildId, name);

export const disableRule = (guildId: string, name: string) =>
  AutoroleService.toggleRule(guildId, name, false);

export const enableRule = (guildId: string, name: string) =>
  AutoroleService.toggleRule(guildId, name, true);

export const incrementReactionTally = (
  key: ReactionTallyKey,
  authorId: string,
): Promise<ReactionTallySnapshot> =>
  AutoroleService.incrementReactionTally(key, authorId);

export const decrementReactionTally = (
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> =>
  AutoroleService.decrementReactionTally(key);

export const loadRulesIntoCache = () => loadRulesIntoCacheFromCache();
export const refreshGuildRules = (guildId: string) =>
  refreshGuildRulesFromCache(guildId);

export const drainMessageState = (guildId: string, messageId: string) =>
  AutoroleService.drainMessageState(guildId, messageId);

export const readReactionTally = async (
  key: ReactionTallyKey,
): Promise<ReactionTallySnapshot | null> => {
  const id = buildTallyId(key);
  const res = await AutoRoleTalliesStore.get(id);
  if (!res.isOk()) return null;
  const tally = res.unwrap();
  if (!tally) return null;
  setTally(tally);
  return tally;
};

export const removeReactionTally = async (
  key: ReactionTallyKey,
): Promise<void> => {
  const id = buildTallyId(key);
  await AutoRoleTalliesStore.delete(id);
  deleteTally(key);
};
