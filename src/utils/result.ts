/**
 * Resultado tipado para operaciones que pueden fallar.
 *
 * Encaje en el sistema:
 * - Este tipo se usa en repositorios/servicios/handlers para modelar errores sin usar `throw`.
 * - Permite distinguir entre "no hay dato" (`Ok(null)`) y "falló la operación" (`Err(error)`).
 *
 * Invariantes y contracto:
 * - **Runtime no-throw**: en paths de runtime (handlers/comandos/servicios) el repo busca no
 *   derribar el proceso por un fallo puntual.
 * - `Err.unwrap()` **no lanza** (ver docstring en el método). Loguea y devuelve `undefined`.
 * - Los callers deben **chequear** `isErr()`/`isOk()` antes de usar `unwrap()`, salvo que
 *   `undefined` sea un valor aceptable.
 *
 * Gotchas:
 * - Si llamas `unwrap()` sobre `Err` y luego accedes propiedades (`unwrap().foo`), vas a obtener
 *   `TypeError`. Es deliberado: el contrato exige guardas.
 *
 * Ejemplo (patrón recomendado):
 * ```ts
 * const res = await repoCall();
 * if (res.isErr()) return ErrResult(res.error);
 * const value = res.unwrap();
 * // ... usar value
 * ```
 */
export type Result<T, E = Error> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
    readonly ok = true;
    readonly err = false;

    constructor(public readonly value: T) { }

    isOk(): this is Ok<T, E> {
        return true;
    }

    isErr(): this is Err<T, E> {
        return false;
    }

    /**
     * Retorna el valor contenido.
     *
     * @remarks
     * En `Ok`, `unwrap()` es total (no falla).
     */
    unwrap(): T {
        return this.value;
    }

    /**
     * Retorna el valor contenido o el valor por defecto (ignorado en Ok).
     */
    unwrapOr(_default: T): T {
        return this.value;
    }

    /**
     * Aplica una función al valor contenido y retorna un nuevo Result.
     */
    map<U>(fn: (value: T) => U): Result<U, E> {
        return new Ok(fn(this.value));
    }

    /**
     * Aplica una función al error (ignorado en Ok).
     */
    mapErr<F>(_fn: (error: E) => F): Result<T, F> {
        return new Ok<T, F>(this.value);
    }

    /**
     * Ejecuta una función con el valor contenido (efecto secundario).
     */
    inspect(fn: (value: T) => void): Result<T, E> {
        fn(this.value);
        return this;
    }

    /**
     * Ejecuta una función con el error (ignorado en Ok).
     */
    inspectErr(_fn: (error: E) => void): Result<T, E> {
        return this;
    }
}

export class Err<T, E> {
    readonly ok = false;
    readonly err = true;

    constructor(public readonly error: E) { }

    isOk(): this is Ok<T, E> {
        return false;
    }

    isErr(): this is Err<T, E> {
        return true;
    }

    /**
     * Obtiene el valor del `Result`.
     *
     * @remarks
     * Este proyecto evita `throw` en paths de runtime (handlers, comandos, servicios) para que
     * un fallo puntual no derribe el proceso.
     *
     * Por eso, a diferencia de Rust u otras implementaciones, **`Err.unwrap()` NO lanza**.
     * En su lugar:
     * - Loguea un warning (para que el error sea visible en logs).
     * - Retorna `undefined` como fallback.
     *
     * Implicación importante: `unwrap()` solo debe usarse cuando el caller ya validó
     * `isOk()` / `isErr()` (o cuando `undefined` sea un valor aceptable).
     */
    unwrap(): T {
        console.warn("Result.unwrap called on Err; returning undefined fallback.", this.error);
        return undefined as unknown as T;
    }

    unwrapOr(defaultValue: T): T {
        return defaultValue;
    }

    map<U>(_fn: (value: T) => U): Result<U, E> {
        return new Err<U, E>(this.error);
    }

    mapErr<F>(fn: (error: E) => F): Result<T, F> {
        return new Err<T, F>(fn(this.error));
    }

    inspect(_fn: (value: T) => void): Result<T, E> {
        return this;
    }

    inspectErr(fn: (error: E) => void): Result<T, E> {
        fn(this.error);
        return this;
    }
}

/** Crea un resultado exitoso. */
export const OkResult = <T, E = Error>(value: T): Result<T, E> => new Ok(value);

/** Crea un resultado fallido. */
export const ErrResult = <T, E = Error>(error: E): Result<T, E> => new Err(error);
