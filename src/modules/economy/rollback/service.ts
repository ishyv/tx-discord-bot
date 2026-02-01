/**
 * Economy Rollback Service.
 *
 * Purpose: Invert audited economy mutations by correlation key.
 * Encaje: Uses audit logs as source of truth; applies inverse ops in a Mongo transaction.
 */

import { getDb, getMongoClient } from "@/db/mongo";
import type { EconomySector } from "../guild/types";
import { economyAuditRepo } from "../audit/repository";
import { economyAccountRepo } from "../account/repository";
import { ErrResult, OkResult, type Result } from "@/utils/result";

export interface RollbackResult {
  readonly correlationId: string;
  readonly entries: number;
  readonly usersTouched: number;
  readonly sectorsTouched: number;
  readonly stockTouched: number;
}

export interface RollbackInput {
  readonly correlationId: string;
  readonly guildId: string;
  readonly actorId: string;
  readonly allowMixedGuilds?: boolean;
}

type CurrencyDeltaMap = Map<string, Map<string, number>>;
type ItemDeltaMap = Map<string, Map<string, number>>;

const addNestedDelta = (
  map: Map<string, Map<string, number>>,
  outerKey: string,
  innerKey: string,
  delta: number,
) => {
  const inner = map.get(outerKey) ?? new Map<string, number>();
  inner.set(innerKey, (inner.get(innerKey) ?? 0) + delta);
  map.set(outerKey, inner);
};

export async function rollbackByCorrelationId(
  input: RollbackInput,
): Promise<Result<RollbackResult, Error>> {
  const { correlationId, guildId, actorId, allowMixedGuilds } = input;

  const already =
    await economyAuditRepo.hasRollbackForCorrelation(correlationId);
  if (already.isErr()) return ErrResult(already.error);
  if (already.unwrap()) {
    return ErrResult(new Error("This correlationId was already rolled back."));
  }

  const auditResult =
    await economyAuditRepo.findByCorrelationKey(correlationId);
  if (auditResult.isErr()) return ErrResult(auditResult.error);
  const entries = auditResult.unwrap();
  if (entries.length === 0) {
    return ErrResult(
      new Error("No audit entries found for this correlationId."),
    );
  }

  const entryGuildIds = new Set(
    entries.map((e) => e.guildId).filter((id): id is string => !!id),
  );
  if (entries.some((e) => !e.guildId)) {
    return ErrResult(
      new Error("Rollback refused: missing guildId in audit entries."),
    );
  }

  if (!allowMixedGuilds) {
    if (entryGuildIds.size !== 1) {
      return ErrResult(
        new Error(
          "Rollback refused: mixed or missing guildIds in audit entries.",
        ),
      );
    }
    if (!entryGuildIds.has(guildId)) {
      return ErrResult(
        new Error("Rollback refused: correlationId does not match this guild."),
      );
    }
  }

  const currencyOps: CurrencyDeltaMap = new Map();
  const itemOps: ItemDeltaMap = new Map();
  const sectorOpsByGuild: Map<string, Map<EconomySector, number>> = new Map();
  const stockOpsByGuild: Map<string, Map<string, number>> = new Map();

  for (const entry of entries) {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;

    const isSectorOnly =
      entry.operationType === "config_update" &&
      typeof meta?.sector === "string";

    if (
      !isSectorOnly &&
      entry.currencyData?.currencyId &&
      typeof entry.currencyData.delta === "number"
    ) {
      const inverseDelta = -entry.currencyData.delta;
      let affectedUserId = entry.targetId;

      if (entry.operationType === "currency_transfer") {
        const direction = meta?.direction as string | undefined;
        affectedUserId =
          direction === "outgoing" ? entry.actorId : entry.targetId;
      }

      if (affectedUserId) {
        addNestedDelta(
          currencyOps,
          affectedUserId,
          entry.currencyData.currencyId,
          inverseDelta,
        );
      }
    }

    if (entry.itemData?.itemId && typeof entry.itemData.quantity === "number") {
      const qty = entry.itemData.quantity;
      let inverseDelta = 0;
      const metaDelta =
        typeof meta?.delta === "number" ? Number(meta.delta) : null;

      switch (entry.operationType) {
        case "item_purchase":
          inverseDelta = -qty;
          break;
        case "item_sell":
          inverseDelta = qty;
          break;
        case "item_grant":
        case "item_remove":
          inverseDelta = metaDelta !== null ? -metaDelta : -qty;
          break;
        default:
          inverseDelta = -qty;
      }

      addNestedDelta(
        itemOps,
        entry.targetId,
        entry.itemData.itemId,
        inverseDelta,
      );
    }

    if (typeof meta?.sector === "string") {
      let sectorDelta: number | null = null;
      if (typeof meta?.sectorDelta === "number") {
        sectorDelta = Number(meta.sectorDelta);
      } else if (
        typeof meta?.sectorBefore === "number" &&
        typeof meta?.sectorAfter === "number"
      ) {
        sectorDelta = Number(meta.sectorAfter) - Number(meta.sectorBefore);
      } else if (typeof entry.currencyData?.delta === "number") {
        sectorDelta = Number(entry.currencyData.delta);
      }

      if (sectorDelta !== null) {
        const sector = meta.sector as EconomySector;
        const entryGuildId = entry.guildId as string;
        const sectorMap =
          sectorOpsByGuild.get(entryGuildId) ??
          new Map<EconomySector, number>();
        sectorMap.set(sector, (sectorMap.get(sector) ?? 0) - sectorDelta);
        sectorOpsByGuild.set(entryGuildId, sectorMap);
      }
    }

    if (typeof meta?.stockDelta === "number") {
      const itemId =
        entry.itemData?.itemId ?? (meta?.itemId as string | undefined);
      if (itemId) {
        const entryGuildId = entry.guildId as string;
        const stockMap =
          stockOpsByGuild.get(entryGuildId) ?? new Map<string, number>();
        stockMap.set(
          itemId,
          (stockMap.get(itemId) ?? 0) - Number(meta.stockDelta),
        );
        stockOpsByGuild.set(entryGuildId, stockMap);
      }
    }
  }

  const userIds = new Set<string>();
  for (const key of currencyOps.keys()) userIds.add(key);
  for (const key of itemOps.keys()) userIds.add(key);

  for (const userId of userIds) {
    const ensured = await economyAccountRepo.ensure(userId);
    if (ensured.isErr()) {
      return ErrResult(
        new Error(`Rollback refused: failed to ensure account for ${userId}.`),
      );
    }
  }

  const client = await getMongoClient();
  const db = await getDb();
  const usersCol = db.collection("users");
  const guildsCol = db.collection("guilds");

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const [userId, currencyMap] of currencyOps) {
        const user = await usersCol.findOne({ _id: userId } as any, {
          session,
        });
        if (!user) {
          throw new Error(`User not found during rollback: ${userId}`);
        }

        const currency = { ...(user.currency ?? {}) } as Record<
          string,
          unknown
        >;
        for (const [currencyId, delta] of currencyMap) {
          const current = currency[currencyId];
          if (typeof current === "number" || current == null) {
            const currentNum = typeof current === "number" ? current : 0;
            currency[currencyId] = currentNum + delta;
          } else if (
            typeof current === "object" &&
            current != null &&
            "hand" in (current as Record<string, unknown>) &&
            "bank" in (current as Record<string, unknown>)
          ) {
            const hand = Number((current as any).hand ?? 0);
            currency[currencyId] = { ...(current as any), hand: hand + delta };
          } else {
            const currentNum = typeof current === "number" ? current : 0;
            currency[currencyId] = currentNum + delta;
          }
        }

        const itemMap = itemOps.get(userId);
        const inventory = { ...(user.inventory ?? {}) } as Record<string, any>;
        if (itemMap) {
          for (const [itemId, delta] of itemMap) {
            const currentQty = Number(inventory[itemId]?.quantity ?? 0);
            const nextQty = currentQty + delta;
            if (nextQty <= 0) {
              delete inventory[itemId];
            } else {
              inventory[itemId] = { id: itemId, quantity: nextQty };
            }
          }
        }

        await usersCol.updateOne(
          { _id: userId } as any,
          { $set: { currency, inventory, updatedAt: new Date() } } as any,
          { session },
        );
      }

      const guildsToUpdate = allowMixedGuilds
        ? entryGuildIds
        : new Set([guildId]);
      for (const gid of guildsToUpdate) {
        const sectorOps =
          sectorOpsByGuild.get(gid) ?? new Map<EconomySector, number>();
        const stockOps = stockOpsByGuild.get(gid) ?? new Map<string, number>();
        if (sectorOps.size === 0 && stockOps.size === 0) continue;

        const guild = await guildsCol.findOne({ _id: gid } as any, { session });
        if (!guild) {
          throw new Error(`Guild not found during rollback: ${gid}`);
        }

        const update: Record<string, any> = {};
        const inc: Record<string, number> = {};
        const set: Record<string, unknown> = {};

        if (sectorOps.size > 0) {
          for (const [sector, delta] of sectorOps) {
            inc[`economy.sectors.${sector}`] = delta;
          }
          set["economy.updatedAt"] = new Date();
        }

        if (stockOps.size > 0) {
          const items = (guild as any).store?.items ?? {};
          for (const [itemId, delta] of stockOps) {
            const currentStock = Number(items?.[itemId]?.stock ?? 0);
            if (Number.isFinite(currentStock) && currentStock >= 0) {
              set[`store.items.${itemId}.stock`] = currentStock + delta;
            }
          }
          set["store.updatedAt"] = new Date();
        }

        if (Object.keys(inc).length > 0) update.$inc = inc;
        if (Object.keys(set).length > 0) update.$set = set;

        if (Object.keys(update).length > 0) {
          await guildsCol.updateOne({ _id: gid } as any, update as any, {
            session,
          });
        }
      }
    });
  } catch (error) {
    return ErrResult(error instanceof Error ? error : new Error(String(error)));
  } finally {
    await session.endSession();
  }

  const rollbackAudit = await economyAuditRepo.create({
    operationType: "rollback",
    actorId,
    targetId: actorId,
    guildId,
    source: "economy-rollback",
    reason: "Rollback by correlationId",
    metadata: {
      originalCorrelationId: correlationId,
      entries: entries.length,
      usersTouched: userIds.size,
      sectorsTouched: Array.from(sectorOpsByGuild.values()).reduce(
        (sum, map) => sum + map.size,
        0,
      ),
      stockTouched: Array.from(stockOpsByGuild.values()).reduce(
        (sum, map) => sum + map.size,
        0,
      ),
      allowMixedGuilds: allowMixedGuilds ?? false,
      guildIds: Array.from(entryGuildIds),
    },
  });

  if (rollbackAudit.isErr()) {
    return ErrResult(rollbackAudit.error);
  }

  return OkResult({
    correlationId,
    entries: entries.length,
    usersTouched: userIds.size,
    sectorsTouched: Array.from(sectorOpsByGuild.values()).reduce(
      (sum, map) => sum + map.size,
      0,
    ),
    stockTouched: Array.from(stockOpsByGuild.values()).reduce(
      (sum, map) => sum + map.size,
      0,
    ),
  });
}
