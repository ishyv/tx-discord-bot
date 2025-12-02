import { connectMongo } from "@/db/client";
import { UserModel, type UserData, type Warn } from "@/db/models/user.schema";
import type { CurrencyInventory } from "@/modules/economy/currency";
import {
  type UserInventory,
} from "@/modules/inventory";

type UserPatch = Partial<{
  rep: number;
  warns: Warn[];
  openTickets: string[];
  currency: CurrencyInventory;
  inventory: UserInventory;
}>;

const defaultUser = (): UserData => ({
  _id: "",
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

    warns: Array.isArray(doc.warns)
      ? doc.warns.map((w: Warn) => ({ ...w }))
      : [],

    openTickets: Array.isArray(doc.openTickets)
      ? doc.openTickets.filter(
        (v: unknown): v is string => typeof v === "string",
      )
      : [],

    currency: doc.currency ?? {},
    inventory: doc.inventory ?? {},
  };
};

const sanitizeTickets = (tickets: string[] | undefined): string[] =>
  Array.from(
    new Set(
      (tickets ?? []).filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );

/**
 * Construye el doc inicial para insertar un usuario nuevo.
 */
function buildUserCreateDoc(id: string, init: UserPatch = {}): UserData {
  const base = defaultUser();

  return {
    _id: id,

    rep: init.rep ?? base.rep,

    warns: Array.isArray(init.warns) ? init.warns : base.warns,
    openTickets: sanitizeTickets(init.openTickets ?? base.openTickets),

    currency: init.currency ?? base.currency,
    inventory: init.inventory ?? base.inventory,
  } as UserData;
}

/**
 * Normaliza un patch para actualizar en Mongo.
 * Solo incluye campos definidos (no metemos undefined en la DB).
 */
function buildUserUpdateDoc(patch: UserPatch): Partial<UserData> {
  const update: Partial<UserData> = {};

  if (patch.rep !== undefined) update.rep = patch.rep;

  if (patch.warns !== undefined) update.warns = patch.warns;
  if (patch.openTickets !== undefined) {
    update.openTickets = sanitizeTickets(patch.openTickets);
  }

  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.inventory !== undefined) update.inventory = patch.inventory;

  return update;
}


/**
 * Devuelve el usuario o null si no existe.
 * Lo mas probable es que quieras usar `ensureUser()` en su lugar. 
 */
export async function getUser(id: string): Promise<UserData | null> {
  await connectMongo();
  const doc = await UserModel.findById(id).lean<UserData>();
  return toUser(doc);
}

export async function userExists(id: string): Promise<boolean> {
  await connectMongo();
  const exists = await UserModel.exists({ _id: id });
  return !!exists;
}

/**
 * Devuelve el usuario; si no existe, lo crea con defaults + init.
 */
export async function ensureUser(
  id: string,
  init: UserPatch = {},
): Promise<UserData> {
  await connectMongo();

  // 1. Intentamos leer
  const found = await UserModel.findById(id).lean<UserData>();
  const mapped = toUser(found);
  if (mapped) return mapped;

  // 2. No existe -> lo creamos
  const createDoc = buildUserCreateDoc(id, init);
  const created = await UserModel.create(createDoc);

  const raw =
    typeof (created as any).toObject === "function"
      ? (created as any).toObject()
      : created;

  const createdMapped = toUser(raw);
  if (!createdMapped) {
    throw new Error(`ensureUser failed (id=${id})`);
  }
  return createdMapped;
}

/**
 * Upsert "de verdad": asegura que el user exista y luego aplica el patch.
 * No usamos operadores raros, solo:
 *  - ensureUser -> get or create
 *  - updateUser -> actualiza campos
 */
export async function upsertUser(
  id: string,
  patch: UserPatch = {},
): Promise<UserData> {
  await connectMongo();

  const existing = await ensureUser(id); // siempre devuelve algo

  const update = buildUserUpdateDoc(patch);
  if (Object.keys(update).length === 0) {
    // Nada que actualizar
    return existing;
  }

  const doc = await UserModel.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true, lean: true },
  );

  return toUser(doc) ?? existing;
}

/**
 * Actualiza un usuario existente (no hace upsert).
 * Lo mas probable es que quieras usar `upsertUser()` en su lugar.
 */
export async function updateUser(
  id: string,
  patch: UserPatch,
): Promise<UserData | null> {
  await connectMongo();

  const update = buildUserUpdateDoc(patch);
  if (Object.keys(update).length === 0) {
    return getUser(id);
  }

  const doc = await UserModel.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true, lean: true },
  );
  return toUser(doc);
}

export async function removeUser(id: string): Promise<boolean> {
  await connectMongo();
  const res = await UserModel.deleteOne({ _id: id });
  return (res.deletedCount ?? 0) > 0;
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
  return Array.isArray(u.warns) ? u.warns.map((w: Warn) => ({ ...w })) : [];
}

export async function setWarns(id: string, warns: Warn[]): Promise<Warn[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $set: { warns: warns ?? [] } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.warns) ? doc.warns.map((w: Warn) => ({ ...w })) : [];
}

export async function addWarn(id: string, warn: Warn): Promise<Warn[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $push: { warns: warn } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.warns) ? doc.warns.map((w: Warn) => ({ ...w })) : [];
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
  return Array.isArray(doc?.warns) ? doc.warns.map((w: Warn) => ({ ...w })) : [];
}

export async function clearWarns(id: string): Promise<Warn[]> {
  await ensureUser(id);
  const doc = await UserModel.findOneAndUpdate(
    { _id: id },
    { $set: { warns: [] } },
    { new: true, lean: true },
  );
  return Array.isArray(doc?.warns) ? doc.warns.map((w: Warn) => ({ ...w })) : [];
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
    .map((o: { _id: unknown }) => o._id)
    .filter((v: unknown): v is string => typeof v === "string");

  if (ids.length === 0) return;
  await UserModel.updateMany(
    { _id: { $in: ids } },
    { $pull: { openTickets: channelId } },
  );
}
