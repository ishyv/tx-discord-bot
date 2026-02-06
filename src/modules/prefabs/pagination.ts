/**
 * Motivación: ofrecer un prefab listo para paginar mensajes interactivos con botones (atrás/siguiente) y selector de página.
 *
 * Idea/concepto: encapsula el wiring de UI (botones + menú select) para que los comandos solo provean el renderer de cada página.
 *
 * Alcance: helper de presentación; no gestiona datos ni permisos más allá de bloquear interacción a un owner opcional.
 *
 * Uso rápido:
 * ```ts
 * await startPagination({
 *   totalPages,
 *   ownerId: ctx.author.id,
 *   sender: (msg) => ctx.editOrReply(msg),
 *   buildPage: (page) => ({
 *     content: `Página ${page + 1}`,
 *   }),
 * });
 * ```
 */
import {
  ActionRow,
  Button,
  StringSelectMenu,
  StringSelectOption,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import type { InteractionCreateBodyRequest } from "seyfert/lib/common";
import { UI, type SenderFn } from "@/modules/ui";

type PaginationState = {
  page: number;
  showPicker: boolean;
};

export interface PaginationOptions {
  /** Cantidad total de páginas disponibles (>=1). */
  totalPages: number;
  /** Página inicial (base 0). Default: 0. */
  initialPage?: number;
  /** Ventana máxima de opciones en el selector (1-25). Default: 25. */
  pageWindow?: number;
  /** Función que envía/edita el mensaje (normalmente `ctx.editOrReply`). */
  sender: SenderFn;
  /** Construye el contenido de una página. No necesita añadir componentes; el prefab los agrega. */
  buildPage: (page: number) => InteractionCreateBodyRequest;
  labels?: {
    previous?: string;
    select?: string;
    next?: string;
  };
  /** Si se indica, solo este user podrá usar los controles. */
  ownerId?: string;
}

const DEFAULT_LABELS = {
  previous: "Previous",
  select: "Select page",
  next: "Next",
};

const MAX_SELECT_OPTIONS = 25;

function clampPage(page: number, total: number): number {
  const max = Math.max(1, Math.trunc(total));
  const next = Number.isFinite(page) ? Math.trunc(page) : 0;
  return Math.min(Math.max(next, 0), max - 1);
}

async function ensureOwner(
  ownerId: string | undefined,
  actorId: string,
  ctx: { write: (payload: any) => Promise<any> },
): Promise<boolean> {
  if (!ownerId || ownerId === actorId) return true;
  await ctx.write({
    content: "You cannot use this pagination.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

function buildPageOptions(
  totalPages: number,
  current: number,
  windowSize: number,
): StringSelectOption[] {
  const size = Math.min(
    Math.max(1, windowSize),
    MAX_SELECT_OPTIONS,
    totalPages,
  );
  const half = Math.floor(size / 2);
  let start = Math.max(0, current - half);
  if (start + size > totalPages) {
    start = Math.max(0, totalPages - size);
  }

  const options: StringSelectOption[] = [];
  for (let i = 0; i < size; i++) {
    const pageIndex = start + i;
    options.push(
      new StringSelectOption()
        .setLabel(`Page ${pageIndex + 1}`)
        .setValue(String(pageIndex + 1))
        .setDescription(pageIndex === current ? "Current" : ""),
    );
  }
  return options;
}

export function createPaginationUI(
  options: PaginationOptions,
): UI<PaginationState> {
  const totalPages = Math.max(1, Math.trunc(options.totalPages));
  const labels = { ...DEFAULT_LABELS, ...(options.labels ?? {}) };
  const pageWindow = options.pageWindow ?? MAX_SELECT_OPTIONS;

  return new UI<PaginationState>(
    {
      page: clampPage(options.initialPage ?? 0, totalPages),
      showPicker: false,
    },
    (state) => {
      const currentPage = clampPage(state.page, totalPages);
      const base = options.buildPage(currentPage);

      const rows: Array<ActionRow<any>> = [];

      if (totalPages > 1) {
        const back = new Button()
          .setLabel(labels.previous)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage <= 0)
          .onClick("pagination_prev", async (buttonCtx) => {
            if (
              !(await ensureOwner(
                options.ownerId,
                buttonCtx.author.id,
                buttonCtx,
              ))
            )
              return;
            state.page = clampPage(currentPage - 1, totalPages);
          });

        const pick = new Button()
          .setLabel(labels.select)
          .setStyle(ButtonStyle.Primary)
          .onClick("pagination_pick", async (buttonCtx) => {
            if (
              !(await ensureOwner(
                options.ownerId,
                buttonCtx.author.id,
                buttonCtx,
              ))
            )
              return;
            state.showPicker = !state.showPicker;
          });

        const next = new Button()
          .setLabel(labels.next)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage >= totalPages - 1)
          .onClick("pagination_next", async (buttonCtx) => {
            if (
              !(await ensureOwner(
                options.ownerId,
                buttonCtx.author.id,
                buttonCtx,
              ))
            )
              return;
            state.page = clampPage(currentPage + 1, totalPages);
          });

        rows.push(new ActionRow<Button>().addComponents(back, pick, next));

        if (state.showPicker) {
          const select = new StringSelectMenu()
            .setPlaceholder("Choose a page")
            .setValuesLength({ min: 1, max: 1 })
            .setOptions(buildPageOptions(totalPages, currentPage, pageWindow))
            .onSelect("pagination_select", async (menuCtx) => {
              if (
                !(await ensureOwner(
                  options.ownerId,
                  menuCtx.author.id,
                  menuCtx,
                ))
              )
                return;
              await menuCtx.deferUpdate();
              const value = menuCtx.interaction.values?.[0];
              const target = clampPage(
                Number.parseInt(value ?? "1", 10) - 1,
                totalPages,
              );
              state.page = target;
              state.showPicker = false;
            });

          rows.push(new ActionRow<StringSelectMenu>().addComponents(select));
        }
      }

      const combinedComponents = rows.length
        ? [...rows, ...(base.components ?? [])]
        : base.components;

      return {
        ...base,
        components: combinedComponents as any,
      };
    },
    (msg) => options.sender(msg),
  );
}

export async function startPagination(
  options: PaginationOptions,
): Promise<UI<PaginationState>> {
  const ui = createPaginationUI(options);
  await ui.send();
  return ui;
}

