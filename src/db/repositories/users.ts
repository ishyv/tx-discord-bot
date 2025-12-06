
import { UserModel, type UserData, type Warn } from "@/db/models/user.schema";
import { MongoStore } from "@/db/store";
import { connectMongo } from "@/db/client";

const defaultUser = (id: string): UserData => ({
  _id: id,
  rep: 0,
  warns: [],
  openTickets: [],
  currency: {},
  inventory: {},
});

export const toUser = (doc: UserData | null): UserData | null => {
  if (!doc) return null;
  return {
    _id: doc._id,
    rep: Number(doc.rep ?? 0),
    warns: Array.isArray(doc.warns) ? doc.warns.map((w: Warn) => ({ ...w })) : [],
    openTickets: Array.isArray(doc.openTickets) ? doc.openTickets.filter((v): v is string => typeof v === "string") : [],
    currency: doc.currency ?? {},
    inventory: doc.inventory ?? {},
  };
};

class UserStore extends MongoStore<UserData> {
  constructor() {
    super(UserModel, defaultUser);
  }

  // Specialized methods that are hard to make generic or require atomic ops

  async getReputation(id: string): Promise<number> {
    const user = await this.ensure(id);
    return Math.max(0, Number(user.rep ?? 0));
  }

  async setReputation(id: string, value: number): Promise<number> {
    const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
    const target = numeric < 0 ? 0 : numeric;

    // We can use the generic set (upsert)
    const res = await this.set(id, { rep: target });
    return res.rep;
  }

  async adjustReputation(id: string, delta: number): Promise<number> {
    await this.connect();
    if (!Number.isFinite(delta)) return this.getReputation(id);
    const step = Math.trunc(delta);
    if (step === 0) return this.getReputation(id);

    // Atomic clamp using pipeline
    const doc = await this.model.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            rep: { $max: [{ $add: ["$rep", step] }, 0] },
          },
        },
      ],
      { new: true, upsert: true, lean: true } // Upsert works with pipeline in modern Mongo? 
      // Actually pipeline update with upsert is tricky if document doesn't exist.
      // Mongoose 6+ supports it better.
      // Fallback: ensure then update.
    );

    // If doc is null (pipeline upsert might fail on older mongo/mongoose versions if filtered), safe fallback:
    if (!doc) {
      await this.ensure(id);
      return this.adjustReputation(id, delta);
    }

    return Math.max(0, Number(doc?.rep ?? 0));
  }

  // Wrappers for specific fields could be moved to logic layer or kept here for convenience
  async addWarn(id: string, warn: Warn): Promise<Warn[]> {
    await this.connect();
    await this.ensure(id); // Ensure exists so push works
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $push: { warns: warn } },
      { new: true, lean: true }
    );
    return doc?.warns ?? [];
  }
}

export const userStore = new UserStore();

// --- Backend Compatibility / Transitional Exports ---
// Ideally we replace these usages with userStore methods, but for now we re-export wrappers

export async function getUser(id: string) { return userStore.get(id); }
export async function ensureUser(id: string) { return userStore.ensure(id); }
export async function updateUser(id: string, patch: Partial<UserData>) { return userStore.update(id, patch); }
export async function upsertUser(id: string, patch: Partial<UserData>) { return userStore.set(id, patch); }
export async function removeUser(id: string) { return userStore.remove(id); }

export const getUserReputation = (id: string) => userStore.getReputation(id);
export const setUserReputation = (id: string, val: number) => userStore.setReputation(id, val);
export const adjustUserReputation = (id: string, delta: number) => userStore.adjustReputation(id, delta);

export async function addWarn(id: string, warn: Warn) { return userStore.addWarn(id, warn); }

// ... other specialized functions can be migrated one by one or kept as wrappers
// We should check what else was in users.ts.
// listWarns, setWarns, removeWarn, clearWarns
// listOpenTickets, setOpenTickets, addOpenTicket, removeOpenTicket, removeOpenTicketByChannel

// Implementing the rest to maintain full compatibility for now
export async function listWarns(id: string) {
  const u = await userStore.ensure(id);
  return u.warns ?? [];
}
export async function setWarns(id: string, warns: Warn[]) {
  const u = await userStore.set(id, { warns });
  return u.warns ?? [];
}
export async function removeWarn(id: string, warnId: string) {
  await connectMongo();
  await userStore.ensure(id);
  const doc = await UserModel.findByIdAndUpdate(id, { $pull: { warns: { warn_id: warnId } } }, { new: true, lean: true });
  return doc?.warns ?? [];
}
export async function clearWarns(id: string) {
  return setWarns(id, []);
}

export async function listOpenTickets(id: string) {
  const u = await userStore.ensure(id);
  return u.openTickets ?? [];
}

// Helper strict typing
const sanitize = (list: string[]) => Array.from(new Set(list.filter(s => typeof s === 'string')));

export async function setOpenTickets(id: string, tickets: string[]) {
  const u = await userStore.set(id, { openTickets: sanitize(tickets) });
  return u.openTickets;
}

export async function addOpenTicket(id: string, channelId: string) {
  await connectMongo();
  await userStore.ensure(id);
  const doc = await UserModel.findByIdAndUpdate(id, { $addToSet: { openTickets: channelId } }, { new: true, lean: true });
  return doc?.openTickets ?? [];
}

export async function removeOpenTicket(id: string, channelId: string) {
  await connectMongo();
  await userStore.ensure(id);
  const doc = await UserModel.findByIdAndUpdate(id, { $pull: { openTickets: channelId } }, { new: true, lean: true });
  return doc?.openTickets ?? [];
}

export async function removeOpenTicketByChannel(channelId: string) {
  await connectMongo();
  if (!channelId) return;
  const owners = await UserModel.find({ openTickets: channelId }, { _id: 1 }).lean();
  const ids = owners.map((o: any) => o._id);
  if (ids.length === 0) return;
  await UserModel.updateMany({ _id: { $in: ids } }, { $pull: { openTickets: channelId } });
}
