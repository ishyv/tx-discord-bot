/**
 * Propósito: orquestar transiciones optimistas cuando no hay transacciones
 * reales en Mongo, evitando estados corruptos por condiciones de carrera.
 * Encaje: helper de bajo nivel para repositorios que usan compare-and-swap
 * basado en snapshots calculados por el caller.
 * Dependencias clave: utilidades `Result` (para no lanzar) y callbacks de
 * repositorio que conocen la estructura de datos concreta.
 * Invariantes: `getSnapshot` debe ser determinista respecto al usuario
 * recibido, `computeNext` no debe tener efectos laterales (se reintenta),
 * `commit` debe devolver `null` únicamente cuando falla el CAS con el
 * snapshot esperado, y `attempts` debe ser > 0 para evitar bucles infinitos.
 * Gotchas: si `getFresh` devuelve el mismo snapshot que falló, el bucle se
 * repetirá hasta agotar `attempts`; los callers deben actualizar el snapshot
 * tras cada relectura real.
 */
import { ErrResult, OkResult, type Result } from "@/utils/result";

export type AtomicTransitionParams<TUser, TSnapshot, TNext, TOut> = {
  attempts: number;
  getInitial: () => Promise<Result<TUser, Error>>;
  getFresh: (
    previousUser: TUser,
    previousSnapshot: TSnapshot,
  ) => Promise<Result<TUser, Error>>;
  getSnapshot: (user: TUser) => TSnapshot;
  computeNext: (
    snapshot: TSnapshot,
  ) => Promise<Result<TNext, Error>> | Result<TNext, Error>;
  commit: (
    expected: TSnapshot,
    next: TNext,
  ) => Promise<Result<TUser | null, Error>>;
  project: (updatedUser: TUser, next: TNext, expected: TSnapshot) => TOut;
  onExhausted: (
    lastUser: TUser,
    lastSnapshot: TSnapshot,
  ) => Result<TOut, Error>;
};

/**
 * Ejecuta una transición con reintentos y compare-and-swap.
 *
 * Propósito: minimizar conflictos de concurrencia sin bloqueos; si el CAS
 * falla, se relee el usuario y se recalcula el snapshot hasta agotar
 * `attempts`.
 * Parámetros clave:
 * - `getInitial`: primera lectura; debe ser coherente con `getSnapshot`.
 * - `computeNext`: calcula el siguiente estado a partir de un snapshot
 *   inmutable; no mutar objetos compartidos.
 * - `commit`: persiste de forma condicional; debe devolver `null` solo cuando
 *   el snapshot esperado ya no coincide.
 * Retorno: `OkResult` con el valor proyectado o `ErrResult` con el error
 * encontrado en cualquiera de las fases.
 * Errores: burbujea cualquier error de lectura/escritura; el caller decide si
 * es recuperable.
 * Invariantes: `snapshot` debe reflejar exactamente el estado usado en
 * `commit` para que la verificación de concurrencia sea correcta.
 * RISK: si `onExhausted` normaliza silenciosamente, se pueden perder
 * incrementos concurrentes; preferir fallar explícitamente si el uso lo
 * requiere.
 */
export async function atomicTransition<TUser, TSnapshot, TNext, TOut>(
  params: AtomicTransitionParams<TUser, TSnapshot, TNext, TOut>,
): Promise<Result<TOut, Error>> {
  const initial = await params.getInitial();
  if (initial.isErr()) return ErrResult(initial.error);

  let user = initial.unwrap();
  let snapshot = params.getSnapshot(user);

  for (let attempt = 0; attempt < params.attempts; attempt += 1) {
    const nextRes = await params.computeNext(snapshot);
    if (nextRes.isErr()) return ErrResult(nextRes.error);
    const next = nextRes.unwrap();

    const committed = await params.commit(snapshot, next);
    if (committed.isErr()) return ErrResult(committed.error);

    const updatedUser = committed.unwrap();
    if (updatedUser) {
      return OkResult(params.project(updatedUser, next, snapshot));
    }

    // WHY: commit devolvió null => otro writer ganó la carrera; releemos antes
    // de recomputar para evitar recalcular sobre datos obsoletos.
    const fresh = await params.getFresh(user, snapshot);
    if (fresh.isErr()) return ErrResult(fresh.error);

    user = fresh.unwrap();
    snapshot = params.getSnapshot(user);
  }

  // RISK: llegar aquí implica conflictos persistentes; `onExhausted` decide si
  // normalizar (ej. devolver último snapshot) o fallar para que el caller
  // actúe (alerta/telemetría/reintentos externos).
  return params.onExhausted(user, snapshot);
}
