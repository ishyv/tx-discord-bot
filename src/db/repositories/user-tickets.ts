import type { Filter } from "mongodb";
import { unwrapFindOneAndUpdateResult } from "@/db/helpers";
import { getDb } from "@/db/mongo";
import type { User } from "@/db/schemas/user";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { UserStore } from "./users";

/**
 * Repositorio especializado para `openTickets` por usuario.
 *
 * Propósito: encapsular lecturas/parches sobre el array de tickets abiertos con
 * sanitización y límites; evita que cada feature haga `$push` directo.
 * Invariantes: `openTickets` siempre es array de strings únicos; todas las
 * operaciones devuelven `Result` y no lanzan.
 * Dependencias: `UserStore.ensure` para inicializar documentos; `getDb` para
 * colección real; `sanitizeTickets` quita duplicados y entradas no string.
 * Gotchas: `addWithLimit` depende de `$expr` y tamaño; si cambia el shape de
 * `openTickets`, ajustar el filtro; `ensure` puede rellenar defaults silenciosos.
 */

const usersCollection = async () => (await getDb()).collection<User>("users");

const sanitizeTickets = (list: string[]) =>
  Array.from(new Set(list.filter((s) => typeof s === "string")));

export const UserTicketsRepo = {
  /**
   * Devuelve los tickets abiertos normalizados para un usuario.
   * Side effects: garantiza el documento vía `UserStore.ensure`.
   * Errores: retorna `Result` erróneo si falla ensure; no lanza.
   */
  async listOpen(userId: string): Promise<Result<string[]>> {
    const res = await UserStore.ensure(userId);
    if (res.isErr()) return res.map(() => []);
    return OkResult(res.unwrap().openTickets ?? []);
  },

  /**
   * Reemplaza el array de `openTickets` (sanitizado) para un usuario.
   * Uso: migraciones o reparaciones; no aplica límite.
   */
  async setOpen(userId: string, tickets: string[]): Promise<Result<string[]>> {
    try {
      const res = await UserStore.patch(userId, {
        openTickets: sanitizeTickets(tickets),
      } as any);
      return res.map((u) => u.openTickets ?? []);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Agrega un ticket abierto sin validar límite (usa $addToSet).
   * Se usa cuando el límite ya fue chequeado en capas superiores.
   */
  async addOpen(userId: string, channelId: string): Promise<Result<string[]>> {
    try {
      const col = await usersCollection();
      const res = await col.findOneAndUpdate(
        { _id: userId },
        {
          $addToSet: { openTickets: channelId },
          $set: { updatedAt: new Date() },
        } as any,
        { returnDocument: "after" },
      );
      const doc = unwrapFindOneAndUpdateResult<User>(res);
      return OkResult(doc?.openTickets ?? []);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Elimina un ticket concreto del array de un usuario (con updatedAt).
   * Uso: cierres individuales cuando conocemos al autor.
   */
  async removeOpen(
    userId: string,
    channelId: string,
  ): Promise<Result<string[]>> {
    try {
      const col = await usersCollection();
      const res = await col.findOneAndUpdate(
        { _id: userId },
        {
          $pull: { openTickets: channelId },
          $set: { updatedAt: new Date() },
        } as any,
        { returnDocument: "after" },
      );
      const doc = unwrapFindOneAndUpdateResult<User>(res);
      return OkResult(doc?.openTickets ?? []);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Agrega un ticket solo si no supera `maxPerUser`.
   *
   * Estrategia: usa `$expr` para comparar tamaño de `openTickets` y evita race
   * conditions simples sin transacciones. Permite reinsertar el mismo canal
   * (idempotencia) gracias a `$addToSet`.
   * RISK: cambios en la forma de `openTickets` o índices pueden invalidar el
   * filtro. No lanza; retorna `false` si el límite se supera.
   */
  async addWithLimit(
    userId: string,
    channelId: string,
    maxPerUser: number,
  ): Promise<Result<boolean>> {
    try {
      if (!channelId || maxPerUser <= 0) return OkResult(false);

      await UserStore.ensure(userId);

      const col = await usersCollection();
      const now = new Date();
      const filter: Filter<User> = {
        _id: userId,
        $or: [
          { openTickets: channelId },
          {
            $expr: {
              $lt: [
                { $size: { $ifNull: ["$openTickets", []] } },
                Math.trunc(maxPerUser),
              ],
            },
          },
        ],
      } as any;

      const res = await col.findOneAndUpdate(
        filter,
        {
          $addToSet: { openTickets: channelId },
          $set: { updatedAt: now },
        } as any,
        { returnDocument: "after" },
      );

      return OkResult(Boolean(unwrapFindOneAndUpdateResult<User>(res)));
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Limpia todas las referencias a un canal de ticket eliminado.
   * Uso: cierres forzados o limpieza cuando el canal desapareció.
   */
  async removeByChannel(channelId: string): Promise<Result<void>> {
    try {
      if (!channelId) return OkResult(undefined);
      const col = await usersCollection();
      await col.updateMany(
        { openTickets: channelId } as any,
        { $pull: { openTickets: channelId } } as any,
      );
      return OkResult(undefined);
    } catch (error) {
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },
};
