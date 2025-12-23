/**
 * Repositorio de Autorole (reglas, grants y contadores de reacciones).
 *
 * Responsabilidad:
 * - Persistencia y lectura desde MongoDB para el sistema de autoroles.
 * - Validación de documentos con Zod (schemas en `src/db/schemas/autorole.ts`).
 * - Mapeo a “domain types” para que el resto del bot no consuma documentos crudos del driver.
 *
 * @remarks
 * Este archivo es deliberadamente “bajo nivel”: no decide cuándo otorgar/revocar roles.
 * Esa lógica vive en `src/db/repositories/autorole.service.ts` y módulos relacionados.
 */
import { getDb } from "@/db/mongo";
import {
  AutoRoleRuleSchema,
  AutoRoleGrantSchema,
  AutoRoleTallySchema,
  type AutoRoleRule,
  type AutoRoleGrant,
  type AutoRoleTally,
  AutoRoleTriggerSchema,
} from "@/db/schemas/autorole";
import type {
  AutoRoleGrantReason,
  AutoRoleRule as AutoRoleRuleDomain,
  CreateAutoRoleRuleInput,
  DeleteRuleInput,
  GrantByRuleInput,
  ReactionTallyKey,
  ReactionTallySnapshot,
  RevokeByRuleInput,
  UpdateRuleEnabledInput,
} from "@/modules/autorole/types";

const rulesCol = async () => (await getDb()).collection<AutoRoleRule>("autorole_rules");
const grantsCol = async () => (await getDb()).collection<AutoRoleGrant>("autorole_role_grants");
const talliesCol = async () => (await getDb()).collection<AutoRoleTally>("autorole_reaction_tallies");

// Keys compuestas estables: evitan colisiones sin depender de ObjectIds.
const ruleKey = (guildId: string, name: string) => `${guildId}:${name}`;
const grantKey = (
  guildId: string,
  userId: string,
  roleId: string,
  ruleName: string,
  type: string,
) => `${guildId}:${userId}:${roleId}:${ruleName}:${type}`;
const tallyKey = (guildId: string, messageId: string, emojiKey: string) =>
  `${guildId}:${messageId}:${emojiKey}`;

// Mapea documentos de DB a tipos de dominio (evita exponer resultados crudos del driver).
const toRuleDomain = (doc: AutoRoleRule): AutoRoleRuleDomain => ({
  guildId: doc.guildId,
  name: doc.name,
  trigger: doc.trigger,
  roleId: doc.roleId,
  durationMs: doc.durationMs ?? null,
  enabled: doc.enabled ?? true,
  createdBy: doc.createdBy ?? null,
  createdAt: doc.createdAt ?? new Date(0),
  updatedAt: doc.updatedAt ?? new Date(0),
});

const toGrantDomain = (doc: AutoRoleGrant): AutoRoleGrantReason => ({
  guildId: doc.guildId,
  userId: doc.userId,
  roleId: doc.roleId,
  ruleName: doc.ruleName,
  type: doc.type,
  expiresAt: doc.expiresAt ?? null,
  createdAt: doc.createdAt ?? new Date(0),
  updatedAt: doc.updatedAt ?? new Date(0),
});

const toTallySnapshot = (doc: AutoRoleTally): ReactionTallySnapshot => ({
  key: {
    guildId: doc.guildId,
    messageId: doc.messageId,
    emojiKey: doc.emojiKey,
  },
  authorId: doc.authorId ?? "",
  count: Math.max(doc.count ?? 0, 0),
  updatedAt: doc.updatedAt ?? new Date(0),
});

/**
 * Operaciones de persistencia para reglas de autorole.
 *
 * @remarks
 * Las reglas se identifican por `(guildId, name)` y usan una clave primaria determinística.
 */
export const AutoRoleRulesRepo = {
  /**
   * Lista reglas (habilitadas y deshabilitadas) para un guild.
   */
  async fetchByGuild(guildId: string): Promise<AutoRoleRuleDomain[]> {
    const col = await rulesCol();
    const rows = await col.find<AutoRoleRule>({ guildId }).toArray();
    // No usamos `.parse()` porque puede lanzar si hay documentos legacy/corruptos.
    // En runtime preferimos:
    // - Loguear el problema para diagnóstico.
    // - Filtrar los docs inválidos.
    // - Continuar con el resto (una regla mala no debería romper el sistema entero).
    const parsed = rows
      .map((row) => AutoRoleRuleSchema.safeParse(row))
      .filter((res) => {
        if (res.success) return true;
        console.error("autorole: invalid rule document", { guildId, error: res.error });
        return false;
      })
      .map((res) => (res as any).data as AutoRoleRule);
    return parsed.map((row) => toRuleDomain(row));
  },

  /**
   * Lista todas las reglas de todos los guilds.
   *
   * @remarks
   * Útil en arranque para poblar cachés en memoria.
   */
  async fetchAll(): Promise<AutoRoleRuleDomain[]> {
    const col = await rulesCol();
    const rows = await col.find<AutoRoleRule>({}).toArray();
    const parsed = rows
      .map((row) => AutoRoleRuleSchema.safeParse(row))
      .filter((res) => {
        if (res.success) return true;
        console.error("autorole: invalid rule document", { error: res.error });
        return false;
      })
      .map((res) => (res as any).data as AutoRoleRule);
    return parsed.map((row) => toRuleDomain(row));
  },

  /**
   * Obtiene una regla por `(guildId, name)`.
   */
  async fetchOne(guildId: string, name: string): Promise<AutoRoleRuleDomain | null> {
    const col = await rulesCol();
    const row = await col.findOne<AutoRoleRule>({ guildId, name });
    if (!row) return null;
    const parsed = AutoRoleRuleSchema.safeParse(row);
    if (!parsed.success) {
      console.error("autorole: invalid rule document", {
        guildId,
        name,
        error: parsed.error,
      });
      return null;
    }
    return toRuleDomain(parsed.data);
  },

  /**
   * Lista solo los nombres de las reglas del guild.
   */
  async listNames(guildId: string): Promise<string[]> {
    const col = await rulesCol();
    const rows = await col.find({ guildId }).project({ name: 1, _id: 0 }).toArray();
    return rows.map((row: any) => row.name);
  },

  /**
   * Inserta una regla nueva.
   *
   * @remarks
   * La clave primaria es determinística (`_id = guildId:name`) para evitar duplicados por nombre.
   */
  async insert(input: CreateAutoRoleRuleInput): Promise<AutoRoleRuleDomain> {
    const now = new Date();
    const triggerParsed = AutoRoleTriggerSchema.safeParse(input.trigger);
    const docParsed = AutoRoleRuleSchema.safeParse({
      _id: ruleKey(input.guildId, input.name),
      id: ruleKey(input.guildId, input.name),
      guildId: input.guildId,
      name: input.name,
      roleId: input.roleId,
      trigger: triggerParsed.success ? triggerParsed.data : input.trigger,
      durationMs: input.durationMs ?? null,
      enabled: input.enabled ?? true,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    });
    if (!docParsed.success) {
      // Degradación deliberada: no insertamos basura en DB.
      // Retornamos un objeto "disabled" para que el caller pueda continuar sin crash.
      console.error("autorole: invalid rule insert payload; skipping insert", {
        guildId: input.guildId,
        name: input.name,
        error: docParsed.error,
      });
      return {
        guildId: input.guildId,
        name: input.name,
        trigger: (triggerParsed.success
          ? triggerParsed.data
          : ({ type: "MESSAGE_REACT_ANY", args: {} } as any)) as any,
        roleId: input.roleId,
        durationMs: input.durationMs ?? null,
        enabled: false,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      };
    }

    const doc = docParsed.data;
    const col = await rulesCol();
    await col.insertOne(doc);
    return toRuleDomain(doc);
  },

  /**
   * Upsert de una regla (crea o actualiza).
   *
   * @remarks
   * - `createdAt` se setea solo al insertar.
   * - `updatedAt` se actualiza siempre.
   */
  async upsert(input: CreateAutoRoleRuleInput): Promise<AutoRoleRuleDomain> {
    const col = await rulesCol();
    const now = new Date();
    const triggerParsed = AutoRoleTriggerSchema.safeParse(input.trigger);
    if (!triggerParsed.success) {
      // Si el trigger es inválido, no tiramos excepción: deshabilitamos la regla.
      // Esto evita loops/crashes en el sistema de autoroles.
      console.error("autorole: invalid trigger payload in rule upsert; disabling rule", {
        guildId: input.guildId,
        name: input.name,
        error: triggerParsed.error,
      });
    }
    const result = await col.findOneAndUpdate(
      { guildId: input.guildId, name: input.name },
      {
        $set: {
          roleId: input.roleId,
          trigger: triggerParsed.success
            ? triggerParsed.data
            : ({ type: "MESSAGE_REACT_ANY", args: {} } as any),
          durationMs: input.durationMs ?? null,
          enabled: triggerParsed.success ? (input.enabled ?? true) : false,
          createdBy: input.createdBy ?? null,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: ruleKey(input.guildId, input.name),
          id: ruleKey(input.guildId, input.name),
          guildId: input.guildId,
          name: input.name,
          createdAt: now,
        },
      },
      { returnDocument: "after", upsert: true },
    );
    const value =
      result ??
      (await col.findOne<AutoRoleRule>({ guildId: input.guildId, name: input.name }));
    if (!value) {
      console.error("autorole: FAILED_TO_UPSERT_RULE", {
        guildId: input.guildId,
        name: input.name,
      });
      const triggerParsed = AutoRoleTriggerSchema.safeParse(input.trigger);
      return {
        guildId: input.guildId,
        name: input.name,
        trigger: (triggerParsed.success
          ? triggerParsed.data
          : ({ type: "MESSAGE_REACT_ANY", args: {} } as any)) as any,
        roleId: input.roleId,
        durationMs: input.durationMs ?? null,
        enabled: false,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      };
    }

    const parsed = AutoRoleRuleSchema.safeParse(value);
    if (!parsed.success) {
      console.error("autorole: failed to parse upserted rule; returning fallback", {
        guildId: input.guildId,
        name: input.name,
        error: parsed.error,
      });
      const triggerParsed = AutoRoleTriggerSchema.safeParse(input.trigger);
      return {
        guildId: input.guildId,
        name: input.name,
        trigger: (triggerParsed.success
          ? triggerParsed.data
          : ({ type: "MESSAGE_REACT_ANY", args: {} } as any)) as any,
        roleId: input.roleId,
        durationMs: input.durationMs ?? null,
        enabled: false,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      };
    }

    return toRuleDomain(parsed.data);
  },

  /**
   * Habilita o deshabilita una regla.
   *
   * @returns La regla resultante o `null` si no existe.
   */
  async updateEnabled({
    guildId,
    name,
    enabled,
  }: UpdateRuleEnabledInput): Promise<AutoRoleRuleDomain | null> {
    const col = await rulesCol();
    const row = await col.findOneAndUpdate(
      { guildId, name },
      { $set: { enabled, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    const value = row ?? (await col.findOne<AutoRoleRule>({ guildId, name }));
    if (!value) return null;
    const parsed = AutoRoleRuleSchema.safeParse(value);
    if (!parsed.success) {
      console.error("autorole: invalid rule document after updateEnabled", {
        guildId,
        name,
        error: parsed.error,
      });
      return null;
    }
    return toRuleDomain(parsed.data);
  },

  /**
   * Elimina una regla y sus grants asociados.
   *
   * @remarks
   * Primero borra grants por `(guildId, ruleName)` para no dejar “razones” colgantes.
   */
  async delete(input: DeleteRuleInput): Promise<boolean> {
    const colGrants = await grantsCol();
    const colRules = await rulesCol();
    await colGrants.deleteMany({
      guildId: input.guildId,
      ruleName: input.name,
    });
    const res = await colRules.deleteOne({
      guildId: input.guildId,
      name: input.name,
    });
    return (res.deletedCount ?? 0) > 0;
  },
};

/**
 * Operaciones de persistencia para grants (razones por las que un usuario debe tener un rol).
 *
 * @remarks
 * Un grant NO es “el rol en Discord”; es una razón persistida. El service decide si tiene que
 * encolar un grant/revoke real en Discord dependiendo de cuántas razones existan.
 */
export const AutoRoleGrantsRepo = {
  /**
   * Upsert de un grant (razón) por regla + tipo.
   */
  async upsert(input: GrantByRuleInput): Promise<AutoRoleGrantReason> {
    const col = await grantsCol();
    const now = new Date();
    const res = await col.findOneAndUpdate(
      {
        _id: grantKey(
          input.guildId,
          input.userId,
          input.roleId,
          input.ruleName,
          input.type,
        ),
      },
      {
        $set: {
          guildId: input.guildId,
          userId: input.userId,
          roleId: input.roleId,
          ruleName: input.ruleName,
          type: input.type,
          expiresAt: input.expiresAt ?? null,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { returnDocument: "after", upsert: true },
    );
    const value =
      res ??
      (await col.findOne<AutoRoleGrant>({
        _id: grantKey(
          input.guildId,
          input.userId,
          input.roleId,
          input.ruleName,
          input.type,
        ),
      }));
    if (!value) {
      console.error("autorole: FAILED_TO_SAVE_GRANT", {
        guildId: input.guildId,
        userId: input.userId,
        roleId: input.roleId,
        ruleName: input.ruleName,
        type: input.type,
      });
      return {
        guildId: input.guildId,
        userId: input.userId,
        roleId: input.roleId,
        ruleName: input.ruleName,
        type: input.type,
        expiresAt: input.expiresAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
    }

    const parsed = AutoRoleGrantSchema.safeParse(value);
    if (!parsed.success) {
      console.error("autorole: failed to parse upserted grant; returning fallback", {
        guildId: input.guildId,
        userId: input.userId,
        roleId: input.roleId,
        ruleName: input.ruleName,
        type: input.type,
        error: parsed.error,
      });
      return {
        guildId: input.guildId,
        userId: input.userId,
        roleId: input.roleId,
        ruleName: input.ruleName,
        type: input.type,
        expiresAt: input.expiresAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
    }

    return toGrantDomain(parsed.data);
  },

  /**
   * Elimina una razón específica (por regla + tipo).
   */
  async deleteOne(input: RevokeByRuleInput): Promise<boolean> {
    const col = await grantsCol();
    const res = await col.deleteOne({
      guildId: input.guildId,
      userId: input.userId,
      roleId: input.roleId,
      ruleName: input.ruleName,
      type: input.type,
    });
    return (res.deletedCount ?? 0) > 0;
  },

  /**
   * Lista las razones existentes para un usuario y rol en un guild.
   */
  async listForMemberRole(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<AutoRoleGrantReason[]> {
    const col = await grantsCol();
    const rows = await col.find<AutoRoleGrant>({ guildId, userId, roleId }).toArray();
    const parsed = rows
      .map((row) => AutoRoleGrantSchema.safeParse(row))
      .filter((res) => {
        if (res.success) return true;
        console.error("autorole: invalid grant document", {
          guildId,
          userId,
          roleId,
          error: res.error,
        });
        return false;
      })
      .map((res) => (res as any).data as AutoRoleGrant);
    return parsed.map((row) => toGrantDomain(row));
  },

  /**
   * Lista las razones generadas por una regla (útil para purgas/reportes).
   */
  async listForRule(
    guildId: string,
    ruleName: string,
  ): Promise<AutoRoleGrantReason[]> {
    const col = await grantsCol();
    const rows = await col.find<AutoRoleGrant>({ guildId, ruleName }).toArray();
    const parsed = rows
      .map((row) => AutoRoleGrantSchema.safeParse(row))
      .filter((res) => {
        if (res.success) return true;
        console.error("autorole: invalid grant document", {
          guildId,
          ruleName,
          error: res.error,
        });
        return false;
      })
      .map((res) => (res as any).data as AutoRoleGrant);
    return parsed.map((row) => toGrantDomain(row));
  },

  /**
   * Cuenta cuántas razones existen para un (guildId, userId, roleId).
   */
  async countForRole(
    guildId: string,
    userId: string,
    roleId: string,
  ): Promise<number> {
    const col = await grantsCol();
    const total = await col.countDocuments({
      guildId,
      userId,
      roleId,
    });
    return Number(total ?? 0);
  },

  /** Borra todas las razones asociadas a una regla; retorna cuántas se eliminaron. */
  async purgeForRule(guildId: string, ruleName: string): Promise<number> {
    const col = await grantsCol();
    const res = await col.deleteMany({ guildId, ruleName });
    return res.deletedCount ?? 0;
  },

  /** Borra todas las razones asociadas a un rol en un guild; retorna cuántas se eliminaron. */
  async purgeForGuildRole(guildId: string, roleId: string): Promise<number> {
    const col = await grantsCol();
    const res = await col.deleteMany({ guildId, roleId });
    return res.deletedCount ?? 0;
  },

  /**
   * Busca una razón puntual (user, role, rule, type).
   */
  async find(
    guildId: string,
    userId: string,
    roleId: string,
    ruleName: string,
    type: "LIVE" | "TIMED",
  ): Promise<AutoRoleGrantReason | null> {
    const col = await grantsCol();
    const row = await col.findOne<AutoRoleGrant>({
      guildId,
      userId,
      roleId,
      ruleName,
      type,
    });
    if (!row) return null;
    const parsed = AutoRoleGrantSchema.safeParse(row);
    if (!parsed.success) {
      console.error("autorole: invalid grant document", {
        guildId,
        userId,
        roleId,
        ruleName,
        type,
        error: parsed.error,
      });
      return null;
    }
    return toGrantDomain(parsed.data);
  },

  /**
   * Lista grants `TIMED` vencidos a una fecha de referencia.
   */
  async listDueTimed(reference: Date): Promise<AutoRoleGrantReason[]> {
    const col = await grantsCol();
    const rows = await col
      .find({
        type: "TIMED",
        expiresAt: { $ne: null, $lte: reference },
      })
      .toArray();
    const parsed = rows
      .map((row) => AutoRoleGrantSchema.safeParse(row))
      .filter((res) => {
        if (res.success) return true;
        console.error("autorole: invalid grant document", { error: res.error });
        return false;
      })
      .map((res) => (res as any).data as AutoRoleGrant);
    return parsed.map((row) => toGrantDomain(row));
  },
};

/**
 * Operaciones de persistencia para tallies de reacciones (por mensaje + emoji).
 *
 * @remarks
 * Los tallies son “contadores” usados por triggers basados en reacciones.
 */
export const AutoRoleTalliesRepo = {
  /**
   * Elimina todos los tallies para un mensaje; retorna cuántos documentos borró.
   */
  async deleteForMessage(guildId: string, messageId: string): Promise<number> {
    const col = await talliesCol();
    const res = await col.deleteMany({
      guildId,
      messageId,
    });
    return res.deletedCount ?? 0;
  },

  /**
   * Lista los tallies guardados para un mensaje.
   */
  async listForMessage(
    guildId: string,
    messageId: string,
  ): Promise<ReactionTallySnapshot[]> {
    const col = await talliesCol();
    const rows = await col.find<AutoRoleTally>({ guildId, messageId }).toArray();
    const parsed = rows
      .map((row) => AutoRoleTallySchema.safeParse(row))
      .filter((res) => {
        if (res.success) return true;
        console.error("autorole: invalid tally document", {
          guildId,
          messageId,
          error: res.error,
        });
        return false;
      })
      .map((res) => (res as any).data as AutoRoleTally);
    return parsed.map((row) => toTallySnapshot(row));
  },

  /**
   * Incrementa el tally para una key (guildId + messageId + emojiKey).
   *
   * @remarks
   * Hace upsert: si no existía, crea el documento y luego incrementa.
   */
  async increment(
    key: ReactionTallyKey,
    authorId: string,
  ): Promise<ReactionTallySnapshot> {
    const col = await talliesCol();
    const now = new Date();
    const res = await col.findOneAndUpdate(
      { _id: tallyKey(key.guildId, key.messageId, key.emojiKey) },
      {
        $setOnInsert: {
          guildId: key.guildId,
          messageId: key.messageId,
          emojiKey: key.emojiKey,
          count: 0,
          createdAt: now,
        },
        $set: { authorId, updatedAt: now },
        $inc: { count: 1 },
      },
      { upsert: true, returnDocument: "after" },
    );
    const row =
      res ??
      (await col.findOne<AutoRoleTally>({
        _id: tallyKey(key.guildId, key.messageId, key.emojiKey),
      }));
    if (!row) {
      console.error("autorole: FAILED_TO_INCREMENT_TALLY", { key, authorId });
      return {
        key,
        authorId: authorId ?? "",
        count: 0,
        updatedAt: now,
      };
    }

    const parsed = AutoRoleTallySchema.safeParse(row);
    if (!parsed.success) {
      console.error("autorole: failed to parse incremented tally; returning fallback", {
        key,
        authorId,
        error: parsed.error,
      });
      return {
        key,
        authorId: authorId ?? "",
        count: 0,
        updatedAt: now,
      };
    }

    return toTallySnapshot(parsed.data);
  },

  /**
   * Decrementa el tally; si llega a 0 (o menos), borra el documento.
   *
   * @returns Snapshot actualizado o `null` si no existía.
   */
  async decrement(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    const col = await talliesCol();
    const now = new Date();
    const res = await col.findOneAndUpdate(
      { _id: tallyKey(key.guildId, key.messageId, key.emojiKey) },
      { $inc: { count: -1 }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    const doc =
      res ??
      (await col.findOne<AutoRoleTally>({
        _id: tallyKey(key.guildId, key.messageId, key.emojiKey),
      }));
    if (!doc) return null;

    if ((doc.count ?? 0) <= 0) {
      await col.deleteOne({ _id: doc._id });
    }

    const normalized = {
      ...doc,
      count: Math.max(doc.count ?? 0, 0),
    };
    const parsed = AutoRoleTallySchema.safeParse(normalized);
    if (!parsed.success) {
      console.error("autorole: invalid tally document after decrement", {
        key,
        error: parsed.error,
      });
      return {
        key,
        authorId: (doc as any)?.authorId ?? "",
        count: Math.max((doc as any)?.count ?? 0, 0),
        updatedAt: (doc as any)?.updatedAt ?? now,
      };
    }

    return toTallySnapshot(parsed.data);
  },

  /**
   * Lee un tally por key.
   */
  async read(key: ReactionTallyKey): Promise<ReactionTallySnapshot | null> {
    const col = await talliesCol();
    const row = await col.findOne({
      guildId: key.guildId,
      messageId: key.messageId,
      emojiKey: key.emojiKey,
    });
    if (!row) return null;
    const parsed = AutoRoleTallySchema.safeParse(row);
    if (!parsed.success) {
      console.error("autorole: invalid tally document", { key, error: parsed.error });
      return null;
    }
    return toTallySnapshot(parsed.data);
  },

  /**
   * Elimina un tally por key; retorna `true` si se borró algo.
   */
  async deleteOne(key: ReactionTallyKey): Promise<boolean> {
    const col = await talliesCol();
    const res = await col.deleteOne({
      guildId: key.guildId,
      messageId: key.messageId,
      emojiKey: key.emojiKey,
    });
    return (res.deletedCount ?? 0) > 0;
  },
};
