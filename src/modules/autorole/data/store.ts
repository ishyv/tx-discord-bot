import { MongoStore } from "@/db/mongo-store";
import {
    AutoRoleRuleSchema,
    AutoRoleGrantSchema,
    AutoRoleTallySchema,
    type AutoRoleRuleRow,
    type AutoRoleGrantRow,
    type AutoRoleTallyRow,
} from "../domain/schema";

/**
 * Composite key stable generators.
 */
export const autoroleKeys = {
    rule: (guildId: string, name: string) => `${guildId}:${name}`,
    grant: (guildId: string, userId: string, roleId: string, ruleName: string, type: string) =>
        `${guildId}:${userId}:${roleId}:${ruleName}:${type}`,
    tally: (guildId: string, messageId: string, emojiKey: string) =>
        `${guildId}:${messageId}:${emojiKey}`,
};

/**
 * Persistence for Autorole Rules.
 */
export const AutoRoleRulesStore = new MongoStore<AutoRoleRuleRow>(
    "autorole_rules",
    AutoRoleRuleSchema
);

/**
 * Persistence for Autorole Grants.
 */
export const AutoRoleGrantsStore = new MongoStore<AutoRoleGrantRow>(
    "autorole_role_grants",
    AutoRoleGrantSchema
);

/**
 * Persistence for Autorole Tallies (reaction counters).
 */
export const AutoRoleTalliesStore = new MongoStore<AutoRoleTallyRow>(
    "autorole_reaction_tallies",
    AutoRoleTallySchema
);
