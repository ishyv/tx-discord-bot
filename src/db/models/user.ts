import { Schema, model, type InferSchemaType } from "mongoose";
import type { Warn as DomainWarn } from "@/schemas/user";

/**
 * Users are stored with Discord userId as the Mongo _id to keep the contract
 * identical to the Postgres schema. Warns and open ticket IDs live embedded
 * inside the document to avoid cross-collection joins.
 */
const WarnSchema = new Schema<DomainWarn>(
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
    bank: { type: Number, required: true, default: 0 },
    cash: { type: Number, required: true, default: 0 },
    rep: { type: Number, required: true, default: 0 },
    warns: {
      type: [WarnSchema],
      default: [],
    },
    openTickets: {
      type: [String],
      default: [],
    },
  },
  {
    collection: "users",
    versionKey: false,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  },
);

// Virtual field to expose 'id' as alias for '_id'
UserSchema.virtual("id").get(function virtualId(this: { _id: string }) {
  return this._id;
});

export type UserDoc = InferSchemaType<typeof UserSchema> & { id: string };

export const UserModel = model<UserDoc>("User", UserSchema);
