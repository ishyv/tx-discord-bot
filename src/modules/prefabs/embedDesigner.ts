/**
 * Motivación: estructurar el módulo prefabs (embedDesigner) en piezas reutilizables y autocontenidas.
 *
 * Idea/concepto: agrupa helpers y orquestadores bajo un mismo dominio para evitar acoplamientos dispersos.
 *
 * Alcance: soporte de dominio; no sustituye a los comandos o servicios que consumen el módulo.
 */
import {
  ActionRow,
  Button,
  Embed,
  Modal,
  StringSelectMenu,
  StringSelectOption,
  TextInput,
  type CommandContext,
  type ComponentContext,
  type WebhookMessageStructure,
} from "seyfert";
import { ButtonStyle, MessageFlags, TextInputStyle } from "seyfert/lib/types";
import { registerSessionCallback } from "@/modules/ui/sessions";

type EmbedCoreKey = "title" | "description" | "footer" | "color";
type EmbedModalAction = EmbedCoreKey | `field:${string}` | "addfield";

export interface EmbedFieldDraft {
  key: string;
  label: string;
  value: string;
  inline?: boolean;
}

export interface EmbedDraft {
  title: string;
  description: string;
  footer: string;
  color?: number | null;
  fields: EmbedFieldDraft[];
}

export interface EmbedFieldDefinition {
  key: string;
  label: string;
  placeholder?: string;
  inline?: boolean;
  required?: boolean;
}

export interface EmbedDesignerOptions {
  userId: string;
  content?: string;
  initial?: Partial<EmbedDraft>;
  fields?: EmbedFieldDefinition[];
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (payload: {
    data: EmbedDraft;
    embed: Embed;
  }) => Promise<void> | void;
}

interface EmbedDesignerSession {
  messageId: string;
  ownerId: string;
  draft: EmbedDraft;
  fieldDefs: EmbedFieldDefinition[];
  selectId: string;
  submitId: string;
  cancelId: string;
  addFieldId: string;
  removeFieldId: string;
  expiresAt: number;
  onSubmit: EmbedDesignerOptions["onSubmit"];
}

const sessions = new Map<string, EmbedDesignerSession>();
const SESSION_TTL_MS = 10 * 60 * 1000;

const defaultDraft: EmbedDraft = {
  title: "Título de ejemplo",
  description: "Describe tu contenido aquí.",
  footer: "Pie de página opcional",
  color: null,
  fields: [],
};

function buildEmbedFromDraft(draft: EmbedDraft): Embed {
  const embed = new Embed()
    .setTitle(draft.title || " ")
    .setDescription(draft.description || " ")
    .setFooter({ text: draft.footer || " " });

  if (draft.color) embed.setColor(draft.color);

  if (draft.fields.length > 0) {
    const sanitized = draft.fields
      .filter((f) => f.value && f.label)
      .map((f) => ({
        name: f.label,
        value: f.value,
        inline: f.inline ?? false,
      }));
    if (sanitized.length > 0) {
      embed.addFields(sanitized);
    }
  }

  return embed;
}

function resolveFieldDraft(
  draft: EmbedDraft,
  defs: EmbedFieldDefinition[],
  key: string,
): EmbedFieldDraft {
  const existing = draft.fields.find((f) => f.key === key);
  if (existing) return existing;

  const def = defs.find((f) => f.key === key);
  return {
    key,
    label: def?.label ?? key,
    value: "",
    inline: def?.inline ?? false,
  };
}

function upsertFieldDraft(
  draft: EmbedDraft,
  defs: EmbedFieldDefinition[],
  key: string,
  value: string,
): EmbedDraft {
  const next = { ...draft };
  const existing = draft.fields.find((f) => f.key === key);
  const base = resolveFieldDraft(draft, defs, key);
  const updated: EmbedFieldDraft = { ...base, value };

  if (existing) {
    next.fields = draft.fields.map((f) => (f.key === key ? updated : f));
  } else {
    next.fields = [...draft.fields, updated];
  }

  return next;
}

function buildSelectOptions(
  defs: EmbedFieldDefinition[],
): StringSelectOption[] {
  const options = [
    new StringSelectOption({ label: "Título", value: "title" }),
    new StringSelectOption({ label: "Descripción", value: "description" }),
    new StringSelectOption({ label: "Footer", value: "footer" }),
    new StringSelectOption({ label: "Color (hex)", value: "color" }),
  ];

  for (const def of defs) {
    options.push(
      new StringSelectOption({ label: def.label, value: `field:${def.key}` }),
    );
  }

  return options;
}

function buildSelectComponent(selectId: string, defs: EmbedFieldDefinition[]) {
  const opts = buildSelectOptions(defs);
  const select = new StringSelectMenu()
    .setCustomId(selectId)
    .setOptions(opts)
    .setPlaceholder("Selecciona qué editar")
    .setValuesLength({ min: 1, max: 1 });

  return new ActionRow<StringSelectMenu>().addComponents(select);
}

function buildButtons(session: EmbedDesignerSession) {
  const submit = new Button()
    .setCustomId(session.submitId)
    .setStyle(ButtonStyle.Success)
    .setLabel("Enviar");

  const cancel = new Button()
    .setCustomId(session.cancelId)
    .setStyle(ButtonStyle.Secondary)
    .setLabel("Cancelar");

  return new ActionRow<Button>().addComponents(submit, cancel);
}

function buildFieldMutators(session: EmbedDesignerSession) {
  const add = new Button()
    .setCustomId(session.addFieldId)
    .setStyle(ButtonStyle.Primary)
    .setLabel("Añadir campo");

  const remove = new Button()
    .setCustomId(session.removeFieldId)
    .setStyle(ButtonStyle.Danger)
    .setLabel("Quitar último campo");

  return new ActionRow<Button>().addComponents(add, remove);
}

function ensureSessionOwner(
  session: EmbedDesignerSession | null,
  actorId: string,
): session is EmbedDesignerSession {
  return !!session && session.ownerId === actorId;
}

function isExpired(session: EmbedDesignerSession): boolean {
  return Date.now() > session.expiresAt;
}

function getRequiredIssues(session: EmbedDesignerSession): string[] {
  const issues: string[] = [];
  if (!session.draft.title.trim()) issues.push("Agrega un título");
  if (!session.draft.description.trim()) issues.push("Agrega una descripción");

  for (const def of session.fieldDefs) {
    if (!def.required) continue;
    const field = session.draft.fields.find((f) => f.key === def.key);
    if (!field || !field.value.trim()) {
      issues.push(`Completa: ${def.label}`);
    }
  }

  return issues;
}

async function renderSession(
  ctx: CommandContext | ComponentContext<any>,
  session: EmbedDesignerSession,
) {
  const embed = buildEmbedFromDraft(session.draft);
  const selectRow = buildSelectComponent(session.selectId, session.fieldDefs);
  const buttonsRow = buildButtons(session);
  const mutatorsRow = buildFieldMutators(session);

  await ctx.editOrReply?.(
    {
      content: "Previsualiza y edita tu embed:",
      embeds: [embed],
      components: [selectRow, buttonsRow, mutatorsRow],
      flags: MessageFlags.Ephemeral,
    },
    true,
  );
}

export async function startEmbedDesigner(
  ctx: CommandContext,
  options: EmbedDesignerOptions,
): Promise<void> {
  const fieldDefs =
    options.fields && options.fields.length > 0 ? options.fields : [];

  const draft: EmbedDraft = {
    ...defaultDraft,
    ...options.initial,
    title: options.initial?.title ?? defaultDraft.title,
    description: options.initial?.description ?? defaultDraft.description,
    footer: options.initial?.footer ?? defaultDraft.footer,
    color: options.initial?.color ?? null,
    fields: options.initial?.fields ?? [],
  };

  const baseEmbed = buildEmbedFromDraft(draft);
  const sent = (await ctx.editOrReply(
    {
      content: options.content ?? "Configura tu embed usando el menú:",
      embeds: [baseEmbed],
      components: [],
      flags: MessageFlags.Ephemeral,
    },
    true,
  )) as WebhookMessageStructure | void;

  const messageId = (sent as any)?.id as string | undefined;
  if (!messageId) {
    await ctx.write({
      content:
        "No pude iniciar el diseñador de embeds (mensaje no disponible).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectId = registerSessionCallback<ComponentContext<"StringSelect">>(
    `embed:select:${messageId}`,
    async (interactionCtx) => {
      const session = sessions.get(messageId) ?? null;
      if (!ensureSessionOwner(session, interactionCtx.author.id)) {
        await interactionCtx.write({
          content: "Solo quien inició este flujo puede editar el embed.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (isExpired(session)) {
        sessions.delete(messageId);
        await interactionCtx.write({
          content: "Esta edición expiró. Ejecuta el comando nuevamente.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const selection = interactionCtx.interaction.values?.[0];
      if (!selection) return;

      const modal = new Modal().setTitle("Editar embed");

      if (selection === "color") {
        modal.setCustomId(`embed:modal:${messageId}:color`).addComponents(
          new ActionRow<TextInput>().addComponents(
            new TextInput()
              .setCustomId("value")
              .setLabel("Color hex (ej: #00ffaa)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder(
                session.draft.color
                  ? `Actual: ${session.draft.color.toString(16)}`
                  : "#00ffaa",
              ),
          ),
        );
      } else if (
        selection === "title" ||
        selection === "description" ||
        selection === "footer"
      ) {
        modal
          .setCustomId(`embed:modal:${messageId}:${selection}`)
          .addComponents(
            new ActionRow<TextInput>().addComponents(
              new TextInput()
                .setCustomId("value")
                .setLabel(
                  selection === "title"
                    ? "Título"
                    : selection === "description"
                      ? "Descripción"
                      : "Footer",
                )
                .setStyle(
                  selection === "description"
                    ? TextInputStyle.Paragraph
                    : TextInputStyle.Short,
                )
                .setRequired(selection !== "footer")
                .setPlaceholder("Ingresa el texto"),
            ),
          );
      } else if (selection.startsWith("field:")) {
        const key = selection.slice("field:".length);
        const def = session.fieldDefs.find((f) => f.key === key);
        const current = resolveFieldDraft(
          session.draft,
          session.fieldDefs,
          key,
        );
        modal
          .setCustomId(`embed:modal:${messageId}:field:${key}`)
          .addComponents(
            new ActionRow<TextInput>().addComponents(
              new TextInput()
                .setCustomId("value")
                .setLabel(def?.label ?? key)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(def?.required ?? false)
                .setPlaceholder(
                  def?.placeholder ?? current.value ?? "Ingresa el contenido",
                ),
            ),
          );
      } else {
        return;
      }

      await interactionCtx.interaction.modal(modal);
    },
  );

  const submitId = registerSessionCallback<ComponentContext<"Button">>(
    `embed:submit:${messageId}`,
    async (interactionCtx) => {
      const session = sessions.get(messageId) ?? null;
      if (!ensureSessionOwner(session, interactionCtx.author.id)) {
        await interactionCtx.write({
          content: "Solo quien inició este flujo puede enviar el embed.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (isExpired(session)) {
        sessions.delete(messageId);
        await interactionCtx.write({
          content: "Esta edición expiró. Ejecuta el comando nuevamente.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const issues = getRequiredIssues(session);
      if (issues.length > 0) {
        await interactionCtx.write({
          content: `Faltan datos:\n- ${issues.join("\n- ")}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = buildEmbedFromDraft(session.draft);
      try {
        await session.onSubmit({ data: session.draft, embed });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo procesar el embed.";
        await interactionCtx.write({
          content: message,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      sessions.delete(messageId);
      await interactionCtx.editOrReply(
        {
          content: "Embed enviado.",
          embeds: [embed],
          components: [],
          flags: MessageFlags.Ephemeral,
        },
        true,
      );
    },
  );

  const cancelId = registerSessionCallback<ComponentContext<"Button">>(
    `embed:cancel:${messageId}`,
    async (interactionCtx) => {
      const session = sessions.get(messageId) ?? null;
      if (!ensureSessionOwner(session, interactionCtx.author.id)) {
        await interactionCtx.write({
          content: "Solo quien inició este flujo puede cancelar.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      sessions.delete(messageId);
      await interactionCtx.editOrReply(
        {
          content: "Edición cancelada.",
          components: [],
          embeds: [],
          flags: MessageFlags.Ephemeral,
        },
        true,
      );
    },
  );

  const addFieldId = registerSessionCallback<ComponentContext<"Button">>(
    `embed:add:${messageId}`,
    async (interactionCtx) => {
      const session = sessions.get(messageId) ?? null;
      if (!ensureSessionOwner(session, interactionCtx.author.id)) {
        await interactionCtx.write({
          content: "Solo quien inició este flujo puede editar el embed.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (isExpired(session)) {
        sessions.delete(messageId);
        await interactionCtx.write({
          content: "Esta edición expiró. Ejecuta el comando nuevamente.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modal = new Modal()
        .setCustomId(`embed:modal:${messageId}:addfield`)
        .setTitle("Añadir campo");

      modal.addComponents(
        new ActionRow<TextInput>().addComponents(
          new TextInput()
            .setCustomId("label")
            .setLabel("Etiqueta")
            .setPlaceholder("Ej: Requisitos")
            .setRequired(false)
            .setStyle(TextInputStyle.Short),
        ),
      );
      modal.addComponents(
        new ActionRow<TextInput>().addComponents(
          new TextInput()
            .setCustomId("value")
            .setLabel("Valor")
            .setPlaceholder("Contenido del campo")
            .setRequired(false)
            .setStyle(TextInputStyle.Paragraph),
        ),
      );
      modal.addComponents(
        new ActionRow<TextInput>().addComponents(
          new TextInput()
            .setCustomId("inline")
            .setLabel("Inline? (true/false)")
            .setPlaceholder("false")
            .setRequired(false)
            .setStyle(TextInputStyle.Short),
        ),
      );

      await interactionCtx.interaction.modal(modal);
    },
  );

  const removeFieldId = registerSessionCallback<ComponentContext<"Button">>(
    `embed:remove:${messageId}`,
    async (interactionCtx) => {
      const session = sessions.get(messageId) ?? null;
      if (!ensureSessionOwner(session, interactionCtx.author.id)) {
        await interactionCtx.write({
          content: "Solo quien inició este flujo puede editar el embed.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (isExpired(session)) {
        sessions.delete(messageId);
        await interactionCtx.write({
          content: "Esta edición expiró. Ejecuta el comando nuevamente.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (session.draft.fields.length === 0) {
        await interactionCtx.write({
          content: "No hay campos para quitar.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const nextFields = session.draft.fields.slice(0, -1);
      const next = {
        ...session,
        draft: { ...session.draft, fields: nextFields },
      };
      sessions.set(messageId, next);
      await renderSession(interactionCtx, next);
    },
  );

  const session: EmbedDesignerSession = {
    messageId,
    ownerId: options.userId,
    draft,
    fieldDefs,
    selectId,
    submitId,
    cancelId,
    addFieldId,
    removeFieldId,
    expiresAt: Date.now() + SESSION_TTL_MS,
    onSubmit: options.onSubmit,
  };

  sessions.set(messageId, session);

  const selectRow = buildSelectComponent(selectId, fieldDefs);
  const buttonsRow = buildButtons(session);
  const fieldMutatorsRow = buildFieldMutators(session);

  await ctx.editOrReply({
    content: options.content ?? "Configura tu embed usando el menú:",
    embeds: [buildEmbedFromDraft(draft)],
    components: [selectRow, buttonsRow, fieldMutatorsRow],
    flags: MessageFlags.Ephemeral,
  });
}

export function getEmbedDesignerSession(
  id: string,
): EmbedDesignerSession | null {
  return sessions.get(id) ?? null;
}

export async function applyEmbedModalUpdate(
  ctx: CommandContext | ComponentContext<any>,
  messageId: string,
  target: EmbedModalAction,
  payload: Record<string, string | undefined>,
): Promise<void> {
  const session = sessions.get(messageId) ?? null;
  if (!ensureSessionOwner(session, ctx.author.id)) {
    await ctx.write({
      content: "Solo quien inició este flujo puede editar el embed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!session || isExpired(session)) {
    sessions.delete(messageId);
    await ctx.write({
      content: "Esta edición expiró. Ejecuta el comando nuevamente.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let draft = session.draft;
  if (target === "addfield") {
    const nextFieldIndex = draft.fields.length + 1;
    const rawLabel = (payload.label ?? "").trim();
    const label = rawLabel || `Campo ${nextFieldIndex}`;
    const value = (payload.value ?? "").trim();
    const inlineRaw = (payload.inline ?? "").trim().toLowerCase();
    const inline =
      inlineRaw === "true" ||
      inlineRaw === "1" ||
      inlineRaw === "yes" ||
      inlineRaw === "si" ||
      inlineRaw === "sí";

    const newField: EmbedFieldDraft = {
      key: `field${nextFieldIndex}`,
      label,
      value,
      inline,
    };
    draft = { ...draft, fields: [...draft.fields, newField] };
  } else {
    const value = (payload.value ?? "").trim();
    if (target === "title") draft = { ...draft, title: value };
    if (target === "description") draft = { ...draft, description: value };
    if (target === "footer") draft = { ...draft, footer: value };
    if (target === "color") {
      const normalized = value.trim();
      const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
      const parsed = hex ? Number.parseInt(hex, 16) : NaN;
      draft = { ...draft, color: Number.isNaN(parsed) ? null : parsed };
    }
    if (target.startsWith("field:")) {
      const key = target.slice("field:".length);
      draft = upsertFieldDraft(draft, session.fieldDefs, key, value);
    }
  }

  const nextSession = { ...session, draft };
  sessions.set(messageId, nextSession);

  await renderSession(ctx, nextSession);
}
