/**
 * Representa el resultado de una operación que puede ser exitosa (Ok) o fallida (Err).
 * Inspirado en el tipo Result de Rust.
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

    unwrap(): T {
        throw this.error;
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
