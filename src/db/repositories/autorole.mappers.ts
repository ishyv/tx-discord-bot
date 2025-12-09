/**
 * Author: Repositories team
 * Purpose: Centralises DB <-> domain mappings for autorole rules, grants, and tallies.
 * Why exists: Keeps trigger encoding/decoding and row projections in one place so persistence layers stay DRY and type-safe.
 */
import type {
  AutoRoleGrantDoc,
  AutoRoleReactionTallyDoc,
  AutoRoleRuleDoc,
} from "@/db/models/autorole.schema";
import type {
  AutoRoleGrantReason,
  AutoRoleRule,
  ReactionTallySnapshot,
} from "@/modules/autorole/types";

type TriggerMapper<T extends AutoRoleRule["trigger"]> = {
  fromDb: (row: AutoRoleRuleDoc) => T;
  toDb: (trigger: T) => {
    triggerType: AutoRoleRuleDoc["triggerType"];
    args: AutoRoleRuleDoc["args"];
    durationMs: AutoRoleRuleDoc["durationMs"];
  };
};

const TRIGGER_MAPPERS: {
  [K in AutoRoleRule["trigger"]["type"]]: TriggerMapper<
    Extract<AutoRoleRule["trigger"], { type: K }>
  >;
} = {
  MESSAGE_REACT_ANY: {
    fromDb: () => ({ type: "MESSAGE_REACT_ANY", args: {} }),
    toDb: () => ({
      triggerType: "MESSAGE_REACT_ANY",
      args: {},
      durationMs: null,
    }),
  },
  REACT_SPECIFIC: {
    fromDb: (row) => {
      const base = (row.args ?? {}) as Record<string, unknown>;
      return {
        type: "REACT_SPECIFIC",
        args: {
          messageId: String(base.messageId ?? ""),
          emojiKey: String(base.emojiKey ?? ""),
        },
      };
    },
    toDb: (trigger) => ({
      triggerType: "REACT_SPECIFIC",
      args: trigger.args,
      durationMs: null,
    }),
  },
  REACTED_THRESHOLD: {
    fromDb: (row) => {
      const base = (row.args ?? {}) as Record<string, unknown>;
      return {
        type: "REACTED_THRESHOLD",
        args: {
          emojiKey: String(base.emojiKey ?? ""),
          count: Number(base.count ?? 0),
        },
      };
    },
    toDb: (trigger) => ({
      triggerType: "REACTED_THRESHOLD",
      args: trigger.args,
      durationMs: null,
    }),
  },
  REPUTATION_THRESHOLD: {
    fromDb: (row) => {
      const base = (row.args ?? {}) as Record<string, unknown>;
      return {
        type: "REPUTATION_THRESHOLD",
        args: {
          minRep: Number(base.minRep ?? 0),
        },
      };
    },
    toDb: (trigger) => ({
      triggerType: "REPUTATION_THRESHOLD",
      args: trigger.args,
      durationMs: null,
    }),
  },
  ANTIQUITY_THRESHOLD: {
    fromDb: (row) => ({
      type: "ANTIQUITY_THRESHOLD",
      args: {
        durationMs: row.durationMs ?? 0,
      },
    }),
    toDb: (trigger) => ({
      triggerType: "ANTIQUITY_THRESHOLD",
      args: {},
      durationMs: trigger.args.durationMs,
    }),
  },
};

export function toAutoRoleTrigger(
  row: AutoRoleRuleDoc,
): AutoRoleRule["trigger"] {
  const mapper = TRIGGER_MAPPERS[row.triggerType] ?? TRIGGER_MAPPERS.MESSAGE_REACT_ANY;
  return mapper.fromDb(row);
}

export function encodeTrigger<T extends AutoRoleRule["trigger"]>(trigger: T) {
  const mapper = TRIGGER_MAPPERS[trigger.type] as unknown as TriggerMapper<T>;
  return mapper.toDb(trigger);
}

export function toAutoRoleRule(row: AutoRoleRuleDoc): AutoRoleRule {
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

export function toAutoRoleGrant(row: AutoRoleGrantDoc): AutoRoleGrantReason {
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

export function toAutoRoleTally(
  row: AutoRoleReactionTallyDoc,
): ReactionTallySnapshot {
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
