/**
 * Servicio de tickets (dominio): orquesta canal+persistencia+limites en una sola API.
 *
 * Encaje: usado por UI (componentes/commands) y sistemas para crear/cerrar
 * tickets sin duplicar lógica de Mongo ni manejo de canales.
 * Dependencias clave: repos `user-tickets` y `guilds` para consistencia, API de
 * canales de Discord vía Seyfert, y `Result` para política no-throw.
 * Invariantes: máximo `maxPerUser` tickets abiertos por autor/guild; si falla la
 * persistencia se revierte el canal creado; `pendingTickets` siempre se trata
 * como arreglo de strings sin duplicados.
 * Gotchas: el orden importa (crear canal -> persistir -> actualizar guild);
 * si cambian los índices o la forma de `pendingTickets`, ajustar los pipelines.
 */
import type { UsingClient } from "seyfert";
import { ChannelType } from "seyfert/lib/types";
import { updateGuildPaths } from "@/db/repositories/guilds";
import { UserTicketsRepo } from "@/db/repositories/user-tickets";
import { ErrResult, OkResult, type Result } from "@/utils/result";

export interface OpenTicketParams {
  guildId: string;
  userId: string;
  parentId: string;
  channelName: string;
}

export interface OpenTicketResult {
  channelId: string;
}

/**
 * Abre un ticket creando canal + registrando al usuario con límite.
 *
 * Parámetros: `params` (guildId, userId, parentId, channelName) y `maxPerUser`
 * (límite duro por usuario). `parentId` debe ser categoría válida.
 * Retorno: `Result<{channelId}>`; en error devuelve `ErrResult` con causa o
 * `TICKET_LIMIT_REACHED` cuando supera el límite.
 * Side effects: crea canal en Discord, escribe en repos `UserTickets` y
 * `pendingTickets` en guild; borra el canal si falla cualquiera de los pasos
 * posteriores para evitar huérfanos.
 * Invariantes: la escritura en DB ocurre después de crear el canal; si `addWithLimit`
 * devuelve falso se revierte el canal. No lanza; todo se encapsula en Result.
 */
export async function openTicket(
  client: UsingClient,
  params: OpenTicketParams,
  maxPerUser = 1,
): Promise<Result<OpenTicketResult>> {
  try {
    // WHY: se crea el canal primero para obtener un id real; si el límite falla
    // se borra el canal para no dejar huérfanos.
    const channel = await client.guilds.channels.create(params.guildId, {
      name: params.channelName,
      type: ChannelType.GuildText,
      parent_id: params.parentId,
    });

    const added = await UserTicketsRepo.addWithLimit(
      params.userId,
      channel.id,
      maxPerUser,
    );
    if (added.isErr()) {
      await client.channels.delete(channel.id).catch(() => null);
      return ErrResult(added.error);
    }

    if (!added.unwrap()) {
      await client.channels.delete(channel.id).catch(() => null);
      return ErrResult(new Error("TICKET_LIMIT_REACHED"));
    }

    try {
      await updateGuildPaths(params.guildId, {
        pendingTickets: {
          $setUnion: [
            {
              $cond: [{ $isArray: "$pendingTickets" }, "$pendingTickets", []],
            },
            [channel.id],
          ],
        },
      });
    } catch (error) {
      await UserTicketsRepo.removeOpen(params.userId, channel.id).catch(
        () => null,
      );
      await client.channels.delete(channel.id).catch(() => null);
      return ErrResult(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return OkResult({ channelId: channel.id });
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Sincroniza el cierre de un ticket en guild + user stores.
 *
 * Propósito: eliminar el canal de `pendingTickets` y de `openTickets` de
 * cualquier usuario que lo refiera.
 * Retorno: `Result<void>`; no lanza.
 * Side effects: escribe en `guilds` vía `updateGuildPaths` y en `user-tickets`.
 * Gotchas: no valida que el canal exista en Discord; asume que quien llama ya
 * lo cerró/borró. Usa $setDifference para mantener arrays únicos.
 */
export async function recordTicketClosure(
  guildId: string,
  channelId: string,
): Promise<Result<void>> {
  try {
    await updateGuildPaths(guildId, {
      pendingTickets: {
        $setDifference: [
          {
            $cond: [{ $isArray: "$pendingTickets" }, "$pendingTickets", []],
          },
          [channelId],
        ],
      },
    });
    await UserTicketsRepo.removeByChannel(channelId);
    return OkResult(undefined);
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  }
}
