/**
 * Motivación: normalizar documentos existentes en Mongo para que respeten los valores por defecto y tipos definidos en los esquemas.
 *
 * Idea/concepto: inspecciona cada schema de Mongoose, construye pipelines de updateMany y corrige colecciones sin mantener listas manuales de campos.
 *
 * Alcance: se ejecuta en el arranque para sanear datos; no sustituye migraciones estructurales ni manipula la lógica del dominio.
 */
/**
 * fixDb: startup normalization for Mongo documents.
 *
 * The goal is to align stored documents with the shapes implied by our Mongoose
 * schemas (default values, expected primitive types) without manually listing
 * every field. We introspect each schema path, compute a $set stage that fills
 * missing values and replaces wrong types with defaults, then run bulk
 * updateMany pipelines. A couple of targeted stages handle nested arrays where
 * schema introspection alone is insufficient (e.g., warns array, openTickets).
 */
import type { Model, PipelineStage, Schema, SchemaType } from "mongoose";

import { connectMongo } from "./client";
import { GuildModel } from "./models/guild";
import {
  AutoRoleGrantModel,
  AutoRoleReactionTallyModel,
  AutoRoleRuleModel,
} from "./models/autorole";
import { UserModel } from "./models/user";
import { deepClone } from "@/db/helpers";

type PrimitiveType =
  | "string"
  | "bool"
  | "int"
  | "long"
  | "double"
  | "decimal"
  | "array"
  | "date"
  | "object"
  | "objectId"
  | "null";

const TYPE_MAP: Record<string, PrimitiveType[]> = {
  String: ["string"],
  Number: ["int", "long", "double", "decimal"],
  Boolean: ["bool"],
  Date: ["date"],
  Array: ["array"],
  ObjectID: ["objectId"],
  Mixed: ["object", "array", "string", "bool", "int", "long", "double", "decimal", "date", "null"],
  Map: ["object"],
  Object: ["object"],
  Decimal128: ["decimal"],
};

// Mongo aggregation uses $type strings; map Mongoose path instances to them.
const exprType = (path: string) => `$${path}`;

const isExpectedType = (valueExpr: any, expected: PrimitiveType[]) => ({
  $in: [{ $type: valueExpr }, expected],
});

const mergeObjectDefault = (valueExpr: any, defaultValue: any) => ({
  $cond: [
    { $eq: [{ $type: valueExpr }, "object"] },
    { $mergeObjects: [defaultValue, valueExpr] },
    defaultValue,
  ],
});

const arrayOrDefault = (valueExpr: any, defaultValue: any) => ({
  $cond: [{ $eq: [{ $type: valueExpr }, "array"] }, valueExpr, defaultValue],
});

const deepCloneDefault = <T>(value: T): T => deepClone(value);

// Safely resolve a default value from a schema type and clone it so it is not shared.
const resolveDefaultValue = (schemaType: SchemaType): any => {
  const getter = (schemaType as any).getDefault ?? (schemaType as any).getDefaultValue;
  if (typeof getter === "function") {
    try {
      return deepCloneDefault(getter.call(schemaType));
    } catch {
      // ignore and fall back below
    }
  }
  if ((schemaType as any).defaultValue !== undefined) {
    return deepCloneDefault((schemaType as any).defaultValue);
  }
  return undefined;
};

const defaultsFromSchema = (schema: Schema): Record<string, any> => {
  const defaults: Record<string, any> = {};
  schema.eachPath((pathKey, schemaType) => {
    if (pathKey === "_id" || pathKey === "__v") return;
    const def = resolveDefaultValue(schemaType);
    if (def === undefined) return;
    defaults[pathKey] = def;
  });
  return defaults;
};

// Build a $set object that enforces types/defaults for every path in a schema.
const buildSetStageFromSchema = (schema: Schema): Record<string, any> => {
  const set: Record<string, any> = {};

  schema.eachPath((pathKey, schemaType) => {
    if (pathKey === "_id" || pathKey === "__v") return;

    const defaultValue = resolveDefaultValue(schemaType);
    if (defaultValue === undefined) return;

    const instance = (schemaType as any).instance as string;
    const expectedTypes = TYPE_MAP[instance] ?? [];
    const valueExpr = exprType(pathKey);

    // For objects/mixed we merge defaults to fill missing keys.
    if (expectedTypes.includes("object")) {
      set[pathKey] = mergeObjectDefault(valueExpr, defaultValue);
      return;
    }

    if (expectedTypes.includes("array")) {
      set[pathKey] = arrayOrDefault(valueExpr, defaultValue);
      return;
    }

    if (expectedTypes.length === 0) {
      set[pathKey] = { $ifNull: [valueExpr, defaultValue] };
      return;
    }

    set[pathKey] = {
      $cond: [isExpectedType(valueExpr, expectedTypes), valueExpr, defaultValue],
    };
  });

  return set;
};

const stringArrayOrEmpty = (expression: any) => ({
  $cond: [
    { $eq: [{ $type: expression }, "array"] },
    {
      $filter: {
        input: expression,
        as: "entry",
        cond: { $eq: [{ $type: "$$entry" }, "string"] },
      },
    },
    [],
  ],
});

async function normalizeModel(
  model: Model<any>,
  extraStages: PipelineStage[] = [],
): Promise<void> {
  const baseSet = buildSetStageFromSchema(model.schema);
  const pipeline: PipelineStage[] = [];
  if (Object.keys(baseSet).length > 0) {
    pipeline.push({ $set: baseSet });
  }
  pipeline.push(...extraStages);
  if (pipeline.length === 0) return;

  await model.updateMany({}, pipeline, {
    strict: false,
    updatePipeline: true,
  });
}

// Warns is an array of subdocuments; merge defaults per element.
function buildWarnNormalizer(): PipelineStage | null {
  const warnsPath: any = UserModel.schema.path("warns");
  const warnSchema: Schema | undefined = warnsPath?.schema;
  if (!warnSchema) return null;

  const warnDefaults = defaultsFromSchema(warnSchema);
  const warnDefaultObject =
    Object.keys(warnDefaults).length > 0
      ? warnDefaults
      : {
          reason: "",
          warn_id: "",
          moderator: "",
          timestamp: "",
        };

  return {
    $set: {
      warns: {
        $cond: [
          { $eq: [{ $type: "$warns" }, "array"] },
          {
            $map: {
              input: "$warns",
              as: "warn",
              in: {
                $cond: [
                  { $eq: [{ $type: "$$warn" }, "object"] },
                  { $mergeObjects: [warnDefaultObject, "$$warn"] },
                  warnDefaultObject,
                ],
              },
            },
          },
          [],
        ],
      },
    },
  };
}

// Normalize nested arrays that cannot be derived purely from schema metadata.
function buildUserExtraStages(): PipelineStage[] {
  const stages: PipelineStage[] = [];
  const warnStage = buildWarnNormalizer();
  if (warnStage) stages.push(warnStage);
  stages.push({
    $set: {
      openTickets: stringArrayOrEmpty("$openTickets"),
    },
  });
  return stages;
}

function buildGuildExtraStage(): PipelineStage {
  return {
    $set: {
      pendingTickets: stringArrayOrEmpty("$pendingTickets"),
    },
  };
}

/**
 * Normalize Mongo documents to the shapes defined by the Mongoose schemas.
 * Defaults are derived directly from each schema, avoiding manual field lists.
 */
export async function fixDb(): Promise<void> {
  await connectMongo();

  await normalizeModel(UserModel, buildUserExtraStages());
  await normalizeModel(GuildModel, [buildGuildExtraStage()]);
  await normalizeModel(AutoRoleRuleModel);
  await normalizeModel(AutoRoleGrantModel);
  await normalizeModel(AutoRoleReactionTallyModel);
}
