/**
 * Propósito: ofrecer un atajo seguro para transiciones optimistas sobre
 * documentos `User` sin duplicar el wiring de lectura/rehidratación.
 * Encaje: capa de conveniencia por encima de `atomicTransition` usada por
 * repositorios de dominio (economía, reputación, etc.).
 * Dependencias: `UserStore` (CAS por `_id`), utilidades `Result` y el helper
 * base de transiciones.
 * Invariantes: el snapshot debe derivarse únicamente del usuario cargado; los
 * `commit` deben usar el mismo snapshot que se pasó a `computeNext`;
 * `conflictError` describe la condición de agotamiento de reintentos.
 * Gotchas: `project` solo recibe el usuario actualizado; si necesita datos
 * del snapshot, debe calcularlos antes (evita leer campos inconsistentes tras
 * un CAS parcial).
 */
import { UserStore } from "@/db/repositories/users";
import type { User } from "@/db/schemas/user";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { atomicTransition } from "./atomic-transition";

type UserTransitionOptions<TSnapshot, TNext, TOut> = {
  attempts?: number;
  getSnapshot: (user: User) => TSnapshot;
  computeNext: (
    snapshot: TSnapshot,
  ) => Promise<Result<TNext, Error>> | Result<TNext, Error>;
  commit: (
    userId: string,
    expected: TSnapshot,
    next: TNext,
  ) => Promise<Result<User | null, Error>>;
  project: (updatedUser: User) => TOut;
  conflictError: string;
};

/**
 * Ejecuta una transición CAS específica de usuarios.
 *
 * Propósito: encapsular la receta de relectura + snapshot + commit condicional
 * para la colección `users` sin que cada feature tenga que manejar fallos de
 * concurrencia explícitamente.
 * Parámetros:
 * - `userId`: clave primaria usada para leer/escribir en `UserStore`.
 * - `getSnapshot`: deriva una vista inmutable del usuario (ej. saldo, rep,
 *   flags) que servirá como base del CAS.
 * - `computeNext`: calcula el estado siguiente a partir del snapshot; se
 *   reejecuta en cada reintento.
 * - `commit`: aplica el cambio si el snapshot coincide; debe devolver `null`
 *   cuando el CAS falla (otro writer tocó el documento).
 * - `project`: transforma el usuario final en el valor que consumirá el caller
 *   (ej. monto actualizado).
 * - `conflictError`: mensaje usado cuando se agotaron los reintentos.
 * Side effects: lecturas/escrituras en Mongo; no modifica caches globales.
 * Errores: burbujea errores de I/O; retorna `ErrResult` si se agotan
 * reintentos.
 * Invariantes: `attempts` define un límite duro de reintentos para evitar
 * bucles; los snapshots deben ser comparables (no incluir timestamps
 * volátiles).
 */
export async function runUserTransition<TSnapshot, TNext, TOut>(
  userId: string,
  opts: UserTransitionOptions<TSnapshot, TNext, TOut>,
): Promise<Result<TOut, Error>> {
  return atomicTransition({
    attempts: opts.attempts ?? 3,
    getInitial: () => UserStore.ensure(userId),
    getFresh: (prev) =>
      UserStore.get(userId).then((r) =>
        r.isErr() ? ErrResult(r.error) : OkResult(r.unwrap() ?? prev),
      ),
    getSnapshot: opts.getSnapshot,
    computeNext: opts.computeNext,
    commit: (expected, next) => opts.commit(userId, expected, next),
    project: (updatedUser) => opts.project(updatedUser),
    onExhausted: () => ErrResult(new Error(opts.conflictError)),
  });
}
