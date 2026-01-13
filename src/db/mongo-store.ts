/**
 * Propósito: encapsular operaciones CRUD y CAS sobre colecciones Mongo usando
 * validación Zod en cada lectura/escritura para evitar datos corruptos.
 * Encaje: capa base de repositorios (`UserStore`, `GuildStore`, etc.) que
 * aplica timestamps y defaults sin que cada feature duplique lógica de
 * upsert/normalización.
 * Dependencias relevantes: `buildSafeUpsertUpdate` (asegura `updatedAt` y
 * paths de timestamps), `unwrapFindOneAndUpdateResult` (maneja las variaciones
 * del driver) y `ZodSchema` provisto por cada repositorio.
 * Invariantes: todos los documentos tienen `_id: string`; las operaciones que
 * usan `buildSafeUpsertUpdate` siempre escriben `updatedAt`; `parse` nunca lanza
 * y devuelve defaults si el documento es inválido.
 * Gotchas: `updatePaths` con `pipeline` no actualiza `updatedAt` (el pipeline
 * decide); `parse` puede esconder problemas si no se monitorean los logs de
 * fallos de validación.
 */
import type {
  Collection,
  Document,
  Filter,
  FindOptions,
  UpdateFilter,
} from "mongodb";
import type { ZodSchema } from "zod";
import { ErrResult, OkResult, type Result } from "@/utils/result";
import { buildSafeUpsertUpdate, unwrapFindOneAndUpdateResult } from "./helpers";
import { getDb } from "./mongo";

/**
 * Store genérico con validación defensiva.
 *
 * Invariantes:
 * - El esquema Zod se aplica en toda lectura y fallback a defaults si falla.
 * - Los upsert via `buildSafeUpsertUpdate` garantizan `updatedAt` salvo que el
 *   caller lo desactive explícitamente.
 * - No lanza: devuelve `Result` para que el caller decida sobre reintentos.
 * RISK: abusar de los defaults puede ocultar documentos rotos; vigilar logs de
 * `invalid document`.
 */
export class MongoStore<T extends Document & { _id: string }> {
  constructor(
    private readonly collectionName: string,
    private readonly schema: ZodSchema<T>,
  ) {}

  /**
   * Obtiene la colección Mongo.
   *
   * Propósito: desacoplar el resto de métodos del mecanismo de conexión y
   * permitir mocks en tests.
   * RISK: no cachea la instancia; depende de que `getDb` maneje el singleton
   * del cliente.
   */
  public async collection(): Promise<Collection<T>> {
    return (await getDb()).collection<T>(this.collectionName);
  }

  private mapError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private getDefault(id: string): T {
    const raw = { _id: id };
    const parsed = this.schema.safeParse(raw);
    if (parsed.success) return parsed.data;

    console.error(
      `[MongoStore:${this.collectionName}] failed to build default; using raw fallback`,
      {
        id,
        error: parsed.error,
      },
    );
    return raw as unknown as T;
  }

  private parse(doc: unknown): T {
    const parsed = this.schema.safeParse(doc);
    if (parsed.success) return parsed.data;

    const id = (doc as any)?._id ?? "unknown";
    console.error(
      `[MongoStore:${this.collectionName}] invalid document; using defaults`,
      { id, error: parsed.error },
    );
    return this.getDefault(id);
  }

  /**
   * Lee un documento por `_id` y lo valida.
   *
   * Retorna `null` si no existe; nunca lanza, encapsula el error. Siempre
   * pasa por `parse` para normalizar valores inesperados y registrar logs si
   * el esquema falla.
   */
  async get(id: string): Promise<Result<T | null>> {
    try {
      const col = await this.collection();
      const doc = await col.findOne({ _id: id } as Filter<T>);
      return OkResult(doc ? this.parse(doc) : null);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Garantiza la existencia de un documento.
   *
   * Propósito: inicializar documentos con defaults (derivados del esquema)
   * cuando aún no existen. Usa `$setOnInsert` para no pisar datos reales.
   * Invariantes: no actualiza `updatedAt` al insertar porque no hay cambio de
   * negocio previo; `initial` se mezcla con defaults en el insert.
   * RISK: si el esquema no provee defaults suficientes, `getDefault` puede
   * rellenar con valores vacíos y ocultar errores de shape.
   */
  async ensure(id: string, initial?: Partial<T>): Promise<Result<T>> {
    try {
      const col = await this.collection();
      const defaults = { ...this.getDefault(id), ...initial };

      const update = buildSafeUpsertUpdate<T>(
        { $setOnInsert: defaults as any },
        defaults as any,
        new Date(),
        { setUpdatedAt: false },
      );

      const res = await col.findOneAndUpdate(
        { _id: id } as Filter<T>,
        update as UpdateFilter<T>,
        { upsert: true, returnDocument: "after" },
      );

      const doc = unwrapFindOneAndUpdateResult<T>(res as any);
      return OkResult(this.parse(doc));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Realiza un patch parcial sobre un documento.
   *
   * Propósito: aplicar cambios puntuales sin reemplazar el documento completo.
   * Side effects: upsert implícito con `updatedAt` actualizado.
   * RISK: se mezclan defaults si el documento no existe; puede ocultar
   * discrepancias de esquema previas.
   */
  async patch(id: string, patch: Partial<T>): Promise<Result<T>> {
    try {
      const col = await this.collection();
      const defaults = this.getDefault(id);

      const update = buildSafeUpsertUpdate<T>(
        { $set: patch as any },
        defaults,
        new Date(),
      );

      const res = await col.findOneAndUpdate(
        { _id: id } as Filter<T>,
        update as UpdateFilter<T>,
        { upsert: true, returnDocument: "after" },
      );

      const doc = unwrapFindOneAndUpdateResult<T>(res as any);
      return OkResult(this.parse(doc));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Reemplaza o inserta el documento completo.
   *
   * Propósito: casos donde ya se tiene el objeto final serializable. No toca
   * `updatedAt`; el caller debe haberlo calculado si es relevante.
   * RISK: sobrescribe todo el documento; no usar para parches incrementales.
   */
  async set(id: string, data: T): Promise<Result<T>> {
    try {
      const col = await this.collection();
      await col.replaceOne({ _id: id } as Filter<T>, data, { upsert: true });
      return OkResult(this.parse(data));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Actualiza condicionalmente si el documento coincide con `expected`.
   *
   * Propósito: soporte CAS para operaciones optimistas (ej. economía,
   * reputación). Incluye `updatedAt` al aplicar `next`.
   * Retorno: `null` si no coincidió el snapshot; útil para reintentos.
   * RISK: `expected` se mezcla en el filtro y debe ser mínimo pero estable; no
   * incluir campos que cambian frecuentemente (ej. timestamps variables).
   */
  async replaceIfMatch(
    id: string,
    expected: Partial<T>,
    next: Partial<T>,
  ): Promise<Result<T | null>> {
    try {
      const col = await this.collection();
      const now = new Date();

      const res = await col.findOneAndUpdate(
        { _id: id, ...expected } as Filter<T>,
        { $set: { ...next, updatedAt: now } as any },
        { returnDocument: "after" },
      );

      const doc = unwrapFindOneAndUpdateResult<T>(res as any);
      return OkResult(doc ? this.parse(doc) : null);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Elimina por `_id`.
   *
   * Propósito: remociones puntuales. No limpia relaciones dependientes; el
   * caller debe encargarse de invariantes de integridad referencial.
   */
  async delete(id: string): Promise<Result<boolean>> {
    try {
      const col = await this.collection();
      const res = await col.deleteOne({ _id: id } as Filter<T>);
      return OkResult((res.deletedCount ?? 0) > 0);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Actualiza campos puntuales por ruta (dot-notation) o pipeline.
   *
   * Propósito: mutaciones parciales sin reconstruir el documento completo.
   * Side effects: cuando no hay `pipeline`, escribe `updatedAt`; con `pipeline`
   * se delega al caller (no se aplica timestamp automáticamente).
   * RISK: combinar `upsert` + `paths` parciales puede generar defaults
   * inesperados; validar en los callers críticos.
   */
  async updatePaths(
    id: string,
    paths: Record<string, unknown>,
    options: { upsert?: boolean; pipeline?: Document[] } = {},
  ): Promise<Result<void>> {
    try {
      const col = await this.collection();
      const now = new Date();

      if (options.pipeline) {
        await col.updateOne({ _id: id } as Filter<T>, options.pipeline as any, {
          upsert: options.upsert,
        });
      } else {
        await col.updateOne(
          { _id: id } as Filter<T>,
          { $set: { ...paths, updatedAt: now } as any },
          { upsert: options.upsert },
        );
      }

      return OkResult(undefined);
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }

  /**
   * Busca múltiples documentos y los normaliza con el esquema.
   *
   * Propósito: lecturas en bloque para listados o migraciones ligeras.
   * RISK: parseo leniente puede ocultar documentos inválidos; revisar logs si
   * el dataset es crítico.
   */
  async find(
    filter: Filter<T>,
    options?: FindOptions<T>,
  ): Promise<Result<T[]>> {
    try {
      const col = await this.collection();
      const docs = await col.find(filter, options).toArray();
      return OkResult(docs.map((doc) => this.parse(doc as any)));
    } catch (error) {
      return ErrResult(this.mapError(error));
    }
  }
}
