import { Schema, model, type HydratedDocument } from "mongoose";
import { CurrencyInventorySchema, type CurrencyInventory } from "@/modules/economy/currency";
import { UserInventorySchema, type UserInventory } from "@/modules/inventory/items";

export interface Warn {
  reason: string;
  warn_id: string;
  moderator: string;
  timestamp: string;
}

export interface UserData {
  _id: string; // Discord userId
  rep: number;

  warns: Warn[];
  openTickets: string[];

  currency: CurrencyInventory;
  inventory: UserInventory;
}

const WarnSchema = new Schema<Warn>(
  {
    reason: { type: String, required: true },
    warn_id: { type: String, required: true },
    moderator: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema<UserData>(
  {
    _id: { type: String, required: true },

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

// Hydrated document (if you ever need document methods)
export type UserDoc = HydratedDocument<UserData>;

// Model uses the *plain* type, not the doc type
export const UserModel = model<UserData>("User", UserSchema);
