/**
 * Motivación: definir el modelo autorole en Mongoose para mantener el esquema de la colección en un único lugar.
 *
 * Idea/concepto: declara tipos y restricciones en el schema para mapear documentos de Mongo a la aplicación.
 *
 * Alcance: representa la forma de los datos; no implementa reglas de negocio ni flujos de aplicación.
 */
import { Schema, model } from "mongoose";

export type AutoRoleTriggerType =
  | "MESSAGE_REACT_ANY"
  | "REACT_SPECIFIC"
  | "REACTED_THRESHOLD"
  | "REPUTATION_THRESHOLD"
  | "ANTIQUITY_THRESHOLD";

export type AutoRoleGrantType = "LIVE" | "TIMED";

export type AutoRoleRuleArgs =
  | { type: "MESSAGE_REACT_ANY"; args: Record<string, never> }
  | { type: "REACT_SPECIFIC"; args: { messageId: string; emojiKey: string } }
  | { type: "REACTED_THRESHOLD"; args: { emojiKey: string; count: number } }
  | { type: "REPUTATION_THRESHOLD"; args: { minRep: number } }
  | { type: "ANTIQUITY_THRESHOLD"; args: { durationMs: number } };

export const autoRoleTriggerType = {
  enumValues: [
    "MESSAGE_REACT_ANY",
    "REACT_SPECIFIC",
    "REACTED_THRESHOLD",
    "REPUTATION_THRESHOLD",
    "ANTIQUITY_THRESHOLD",
  ] as const,
};

export const roleGrantType = {
  enumValues: ["LIVE", "TIMED"] as const,
};

const AutoRoleRuleSchema = new Schema(
  {
    _id: { type: String, required: true }, // composite key guildId:name
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    triggerType: {
      type: String,
      enum: [
        "MESSAGE_REACT_ANY",
        "REACT_SPECIFIC",
        "REACTED_THRESHOLD",
        "REPUTATION_THRESHOLD",
        "ANTIQUITY_THRESHOLD",
      ],
      required: true,
    },
    args: { type: Schema.Types.Mixed, required: true, default: {} },
    roleId: { type: String, required: true },
    durationMs: { type: Number, default: null },
    enabled: { type: Boolean, required: true, default: true },
    createdBy: { type: String, default: null },
  },
  {
    collection: "autorole_rules",
    versionKey: false,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  },
);

AutoRoleRuleSchema.virtual("id").get(function virtualId(this: { _id: string }) {
  return this._id;
});
AutoRoleRuleSchema.index({ guildId: 1 });
AutoRoleRuleSchema.index({ guildId: 1, roleId: 1 });

export interface AutoRoleRuleDoc {
  _id: string;
  id: string;
  guildId: string;
  name: string;
  triggerType: AutoRoleTriggerType;
  args: AutoRoleRuleArgs["args"];
  roleId: string;
  durationMs: number | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AutoRoleRuleData = AutoRoleRuleDoc;
export const AutoRoleRuleModel = model<AutoRoleRuleDoc>(
  "AutoRoleRule",
  AutoRoleRuleSchema,
);

const AutoRoleGrantSchema = new Schema(
  {
    _id: { type: String, required: true }, // composite key guildId:userId:roleId:ruleName:type
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    roleId: { type: String, required: true },
    ruleName: { type: String, required: true },
    type: {
      type: String,
      enum: ["LIVE", "TIMED"],
      required: true,
    },
    expiresAt: { type: Date, default: null },
  },
  {
    collection: "autorole_role_grants",
    versionKey: false,
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  },
);

AutoRoleGrantSchema.virtual("id").get(function virtualId(this: { _id: string }) {
  return this._id;
});
AutoRoleGrantSchema.index({ guildId: 1, userId: 1, roleId: 1 });
AutoRoleGrantSchema.index({ guildId: 1, ruleName: 1 });
AutoRoleGrantSchema.index({ expiresAt: 1 });

export interface AutoRoleGrantDoc {
  _id: string;
  id: string;
  guildId: string;
  userId: string;
  roleId: string;
  ruleName: string;
  type: AutoRoleGrantType;
  expiresAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
export type AutoRoleGrantData = AutoRoleGrantDoc;
export const AutoRoleGrantModel = model<AutoRoleGrantDoc>(
  "AutoRoleGrant",
  AutoRoleGrantSchema,
);

const AutoRoleReactionTallySchema = new Schema(
  {
    _id: { type: String, required: true }, // composite key guildId:messageId:emojiKey
    guildId: { type: String, required: true },
    messageId: { type: String, required: true },
    emojiKey: { type: String, required: true },
    authorId: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  {
    collection: "autorole_reaction_tallies",
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: "updatedAt" },
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  },
);

AutoRoleReactionTallySchema.virtual("id").get(function virtualId(this: { _id: string }) {
  return this._id;
});
AutoRoleReactionTallySchema.index({ guildId: 1, emojiKey: 1 });

export interface AutoRoleReactionTallyDoc {
  _id: string;
  id: string;
  guildId: string;
  messageId: string;
  emojiKey: string;
  authorId: string;
  count: number;
  updatedAt?: Date;
}
export type AutoRoleReactionTallyData = AutoRoleReactionTallyDoc;
export const AutoRoleReactionTallyModel = model<AutoRoleReactionTallyDoc>(
  "AutoRoleReactionTally",
  AutoRoleReactionTallySchema,
);
