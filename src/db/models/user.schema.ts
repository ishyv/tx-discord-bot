import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from "mongoose";
import { CurrencyInventorySchema } from "@/modules/economy/currency";
import { UserInventorySchema } from "@/modules/inventory";
import type { UserId, WarnId } from "@/db/types";

const WarnSchema = new Schema(
  {
    reason: { type: String, required: true },
    warn_id: { type: String, required: true },
    moderator: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema(
  {
    _id: { type: String, required: true }, // Discord userId

    rep: { type: Number, required: true, default: 0 },

    warns: {
      type: [WarnSchema],
      default: [],
    },

    openTickets: {
      type: [String],
      default: [],
    },

    currency: {
      type: CurrencyInventorySchema,
      default: {},
    },

    inventory: {
      type: UserInventorySchema,
      default: {},
    },
  },
  {
    collection: "users",
    versionKey: false,
  },
);

// Infer from schema instead of duplicating
type WarnSchemaType = InferSchemaType<typeof WarnSchema>;
type UserSchemaType = InferSchemaType<typeof UserSchema>;

// Add your branded types on top if you care about them:
export type Warn = Omit<WarnSchemaType, "warn_id" | "moderator"> & {
  warn_id: WarnId;
  moderator: UserId;
};

export type UserData = Omit<UserSchemaType, "_id" | "warns"> & {
  _id: UserId;
  warns: Warn[];
};

export type UserDoc = HydratedDocument<UserData>;

export const UserModel = model<UserData>("User", UserSchema);
