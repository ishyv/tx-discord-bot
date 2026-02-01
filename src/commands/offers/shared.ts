import { MessageFlags } from "seyfert/lib/types";
import type { GuildCommandContext } from "seyfert";
import type { OfferDetails } from "@/modules/offers";
import type { EmbedFieldDefinition } from "@/modules/prefabs/embedDesigner";

export const OFFER_FIELD_DEFINITIONS: EmbedFieldDefinition[] = [
  {
    key: "requirements",
    label: "Requisitos",
    placeholder: "Tecnologías, experiencia, stack",
  },
  {
    key: "workMode",
    label: "Modalidad",
    placeholder: "Remoto, híbrido, presencial",
  },
  { key: "salary", label: "Rango salarial", placeholder: "Ej: USD 2000-3000" },
  { key: "contact", label: "Contacto", placeholder: "DM, email, formulario" },
  {
    key: "labels",
    label: "Etiquetas",
    placeholder: "#junior #backend #devops",
  },
  {
    key: "location",
    label: "Ubicación / zona horaria",
    placeholder: "Argentina (GMT-3)",
  },
];

const MIN_DESCRIPTION_LENGTH = 8;

export type OfferDesignerPayload = {
  title: string;
  description: string;
  fields: Array<{ key: string; value?: string | null }>;
};

export async function ensureGuildContext(
  ctx: GuildCommandContext,
  message = "Este comando solo funciona dentro de un servidor.",
): Promise<string | null> {
  if (!ctx.guildId) {
    await ctx.write({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return ctx.guildId;
}

export function labelsToString(labels?: string[] | null): string {
  return (labels ?? []).join(", ");
}

export function splitLabels(input: string | null): string[] {
  if (!input) return [];
  return input
    .split(/[, ]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseOfferDetails(payload: OfferDesignerPayload): {
  details: OfferDetails | null;
  error: string | null;
} {
  const title = payload.title?.trim() ?? "";
  const description = payload.description?.trim() ?? "";
  if (!title || description.length < MIN_DESCRIPTION_LENGTH) {
    return {
      details: null,
      error: "Necesitas un título y una descripción de al menos 8 caracteres.",
    };
  }

  const get = (key: string): string | null =>
    payload.fields.find((f) => f.key === key)?.value?.trim() || null;

  const details: OfferDetails = {
    title,
    description,
    requirements: get("requirements"),
    workMode: get("workMode"),
    duration: get("duration"),
    salary: get("salary"),
    contact: get("contact"),
    labels: splitLabels(get("labels")),
    location: get("location"),
  };

  return { details, error: null };
}

export function buildDesignerFields(details?: OfferDetails) {
  const valueMap: Record<string, string> = {
    requirements: details?.requirements ?? "",
    workMode: details?.workMode ?? "",
    duration: details?.duration ?? "",
    salary: details?.salary ?? "",
    contact: details?.contact ?? "",
    labels: labelsToString(details?.labels),
    location: details?.location ?? "",
  };

  return OFFER_FIELD_DEFINITIONS.map((field) => ({
    ...field,
    value: valueMap[field.key] ?? "",
  }));
}
