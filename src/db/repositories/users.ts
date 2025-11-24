import { connectMongo } from "../client";
import { UserModel, type UserDoc } from "../models/user";
import type { Warn } from "@/schemas/user";

export type MongoUser = {
  id: string;
  bank: number;
  cash: number;
  rep: number;
  warns: Warn[];
  openTickets: string[];
};

type UserPatch = Partial<{
  bank: number;
  cash: number;
  rep: number;
  warns: Warn[];
  openTickets: string[];
}>;

const defaultUser = (): MongoUser => ({
  id: "",
  bank: 0,
  cash: 0,
  rep: 0,
  warns: [],
  openTickets: [],
});

const toUser = (doc: UserDoc | null): MongoUser | null => {
  if (!doc) return null;
  return {
    id: doc._id,
    bank: Number(doc.bank ?? 0),
    cash: Number(doc.cash ?? 0),
    rep: Number(doc.rep ?? 0),
    warns: Array.isArray(doc.warns) ? doc.warns.map((w) => ({ ...w })) : [],
    openTickets: Array.isArray(doc.openTickets)
      ? doc.openTickets.filter((v): v is string => typeof v === "string")
      : [],
  };
};

const sanitizeTickets = (tickets: string[]): string[] =>
  Array.from(
    new Set(
      (tickets ?? []).filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );

export async function getUser(id: string): Promise<MongoUser | null> {
  await connectMongo();
  const doc = await UserModel.findById(id).lean();
  return toUser(doc);
}

export async function userExists(id: string): Promise<boolean> {
  await connectMongo();
  const exists = await UserModel.exists({ _id: id });
  return !!exists;
}

export async function ensureUser(
  id: string,
  init: UserPatch = {},
): Promise<MongoUser> {
  await connectMongo();
  const onInsert: Partial<UserDoc> = { _id: id };
  if (typeof init.bank === "number") onInsert.bank = init.bank;
  if (typeof init.cash === "number") onInsert.cash = init.cash;
  if (typeof init.rep === "number") onInsert.rep = init.rep;
  if (Array.isArray(init.warns)) onInsert.warns = init.warns as any;
  if (Array.isArray(init.openTickets)) onInsert.openTickets = init.openTickets;

  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $setOnInsert: onInsert },
    { upsert: true, new: true, lean: true },
  );
  const mapped = toUser(doc);
  if (!mapped) throw new Error(`ensureUser failed (id=${id})`);
  return mapped;
}

export async function upsertUser(
  id: string,
  patch: UserPatch = {},
): Promise<MongoUser> {
  await connectMongo();
  const update: Record<string, unknown> = {};
  if (typeof patch.bank === "number") update.bank = patch.bank;
  if (typeof patch.cash === "number") update.cash = patch.cash;
  if (typeof patch.rep === "number") update.rep = patch.rep;
  if (Array.isArray(patch.warns)) update.warns = patch.warns;
  if (Array.isArray(patch.openTickets)) update.openTickets = patch.openTickets;

  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    {
      $set: update,
      $setOnInsert: { _id: id },
    },
    { upsert: true, new: true, lean: true },
  );
  return toUser(doc) ?? { ...defaultUser(), id };
}

export async function updateUser(
  id: string,
  patch: UserPatch,
): Promise<MongoUser | null> {
  await connectMongo();
  if (!patch || Object.keys(patch).length === 0) return getUser(id);

  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $set: patch },
    { new: true, lean: true },
  );
  return toUser(doc);
}

export async function removeUser(id: string): Promise<boolean> {
  await connectMongo();
  const res = await UserModel.deleteOne({ _id: id });
  return (res.deletedCount ?? 0) > 0;
}

export async function bumpBalance(
  id: string,
  delta: { bank?: number; cash?: number },
): Promise<MongoUser | null> {
  await ensureUser(id);
  const inc: Record<string, number> = {};
  if (typeof delta.bank === "number") inc.bank = delta.bank;
  if (typeof delta.cash === "number") inc.cash = delta.cash;
  if (Object.keys(inc).length === 0) return getUser(id);

  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $inc: inc },
    { new: true, lean: true, upsert: true },
  );
  return toUser(doc);
}

export async function getUserReputation(id: string): Promise<number> {
  const user = await ensureUser(id);
  return Math.max(0, Number(user.rep ?? 0));
}

export async function setUserReputation(
  id: string,
  value: number,
): Promise<number> {
  await ensureUser(id);
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  const target = numeric < 0 ? 0 : numeric;

  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $set: { rep: target } },
    { new: true, lean: true },
  );
  return Number(doc?.rep ?? target);
}

export async function adjustUserReputation(
  id: string,
  delta: number,
): Promise<number> {
  await ensureUser(id);
  if (!Number.isFinite(delta)) return getUserReputation(id);
  const step = Math.trunc(delta);
  if (step === 0) return getUserReputation(id);

  // Use an update pipeline to clamp at zero atomically.
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    [
      {
        $set: {
          rep: {
            $max: [{ $add: ["$rep", step] }, 0],
          },
        },
      },
    ],
    { new: true, lean: true, updatePipeline: true },
  );
  return Math.max(0, Number(doc?.rep ?? 0));
}

export async function listWarns(id: string): Promise<Warn[]> {
  const u = await ensureUser(id);
  return Array.isArray(u.warns) ? u.warns.map((w) => ({ ...w })) : [];
}

export async function setWarns(id: string, warns: Warn[]): Promise<Warn[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $set: { warns: warns ?? [] } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.warns) ? doc.warns.map((w) => ({ ...w })) : [];
}

export async function addWarn(id: string, warn: Warn): Promise<Warn[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $push: { warns: warn } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.warns) ? doc.warns.map((w) => ({ ...w })) : [];
}

export async function removeWarn(
  id: string,
  warnId: string,
): Promise<Warn[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $pull: { warns: { warn_id: warnId } } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.warns) ? doc.warns.map((w) => ({ ...w })) : [];
}

export async function clearWarns(id: string): Promise<Warn[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $set: { warns: [] } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.warns) ? doc.warns.map((w) => ({ ...w })) : [];
}

export async function listOpenTickets(id: string): Promise<string[]> {
  const user = await ensureUser(id);
  return Array.isArray(user.openTickets)
    ? user.openTickets.filter((v) => typeof v === "string")
    : [];
}

export async function setOpenTickets(
  id: string,
  tickets: string[],
): Promise<string[]> {
  await ensureUser(id);
  const unique = sanitizeTickets(tickets);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $set: { openTickets: unique } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.openTickets) ? [...doc.openTickets] : [];
}

export async function addOpenTicket(
  id: string,
  channelId: string,
): Promise<string[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $addToSet: { openTickets: channelId } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.openTickets) ? [...doc.openTickets] : [];
}

export async function removeOpenTicket(
  id: string,
  channelId: string,
): Promise<string[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $pull: { openTickets: channelId } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.openTickets) ? [...doc.openTickets] : [];
}

export async function removeOpenTicketByChannel(
  channelId: string,
): Promise<void> {
  await connectMongo();
  if (!channelId) return;
  const owners = await UserModel.find(
    { openTickets: channelId },
    { _id: 1 },
  ).lean();
  const ids = owners
    .map((o) => o._id)
    .filter((v): v is string => typeof v === "string");

  if (ids.length === 0) return;
  await UserModel.updateMany(
    { _id: { $in: ids } },
    { $pull: { openTickets: channelId } },
  );
}
