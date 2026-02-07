import type { EconomyAuditEntry } from "@/modules/economy/audit";
import { getLocation, getToolTierFromItemId } from "@/modules/rpg/gathering/definitions";
import type { QuestEvent, QuestStep } from "./types";

function getMetadataValue<T>(
  metadata: Record<string, unknown> | undefined,
  key: string,
): T | undefined {
  if (!metadata) return undefined;
  return metadata[key] as T | undefined;
}

function numberFromUnknown(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return fallback;
}

function mapGatherEvent(entry: EconomyAuditEntry): QuestEvent[] {
  const source = entry.source;
  if (source !== "rpg-mine" && source !== "rpg-forest") {
    return [];
  }

  if (!entry.guildId) {
    return [];
  }

  const action = source === "rpg-mine" ? "mine" : "forest";
  const metadata = entry.metadata;
  const locationId =
    (getMetadataValue<string>(metadata, "locationId") ?? undefined) || undefined;
  const locationTier = locationId ? getLocation(locationId)?.requiredTier : undefined;

  const toolId = getMetadataValue<string>(metadata, "toolId");
  const toolTier = toolId ? getToolTierFromItemId(toolId) : undefined;

  const itemId =
    entry.itemData?.itemId ??
    getMetadataValue<string>(metadata, "itemId") ??
    undefined;

  if (!itemId) {
    return [];
  }

  const qty = numberFromUnknown(
    entry.itemData?.quantity ?? getMetadataValue<number>(metadata, "qty"),
    1,
  );

  if (qty <= 0) {
    return [];
  }

  return [
    {
      type: "gather",
      guildId: entry.guildId,
      userId: entry.targetId,
      action,
      itemId,
      qty,
      locationTier,
      toolTier,
      correlationId: getMetadataValue<string>(metadata, "correlationId"),
      timestamp: entry.timestamp,
    },
  ];
}

function mapProcessEvent(entry: EconomyAuditEntry): QuestEvent[] {
  if (entry.source !== "rpg-processing" || !entry.guildId) {
    return [];
  }

  const metadata = entry.metadata;
  const inputItemId =
    entry.itemData?.itemId ?? getMetadataValue<string>(metadata, "inputItemId");
  if (!inputItemId) {
    return [];
  }

  const outputItemId = getMetadataValue<string>(metadata, "outputMaterialId");
  const outputGained = numberFromUnknown(getMetadataValue<number>(metadata, "outputGained"));
  const attempted = numberFromUnknown(getMetadataValue<number>(metadata, "batchesAttempted"), 1);

  const events: QuestEvent[] = [];

  if (outputGained > 0) {
    events.push({
      type: "process",
      guildId: entry.guildId,
      userId: entry.targetId,
      inputItemId,
      outputItemId,
      qty: outputGained,
      success: true,
      correlationId: getMetadataValue<string>(metadata, "correlationId"),
      timestamp: entry.timestamp,
    });
  }

  const failures = numberFromUnknown(getMetadataValue<number>(metadata, "batchesFailed"));
  if (failures > 0 || outputGained === 0) {
    events.push({
      type: "process",
      guildId: entry.guildId,
      userId: entry.targetId,
      inputItemId,
      outputItemId,
      qty: failures > 0 ? failures : attempted,
      success: false,
      correlationId: getMetadataValue<string>(metadata, "correlationId"),
      timestamp: entry.timestamp,
    });
  }

  return events;
}

function mapCraftEvent(entry: EconomyAuditEntry): QuestEvent[] {
  if (entry.source !== "crafting" || !entry.guildId) {
    return [];
  }

  const metadata = entry.metadata;
  const recipeId = getMetadataValue<string>(metadata, "recipeId");
  if (!recipeId) {
    return [];
  }

  const qty = numberFromUnknown(getMetadataValue<number>(metadata, "quantity"), 1);

  return [
    {
      type: "craft",
      guildId: entry.guildId,
      userId: entry.targetId,
      recipeId,
      qty,
      correlationId: getMetadataValue<string>(metadata, "correlationId"),
      timestamp: entry.timestamp,
    },
  ];
}

function mapMarketListEvent(entry: EconomyAuditEntry): QuestEvent[] {
  if (entry.operationType !== "market_list" || !entry.guildId) {
    return [];
  }

  const metadata = entry.metadata;
  const itemId =
    getMetadataValue<string>(metadata, "itemId") ?? entry.itemData?.itemId;
  if (!itemId) {
    return [];
  }

  const qty = numberFromUnknown(
    getMetadataValue<number>(metadata, "qty") ?? entry.itemData?.quantity,
    1,
  );

  return [
    {
      type: "market_list",
      guildId: entry.guildId,
      userId: entry.actorId,
      itemId,
      qty,
      correlationId: getMetadataValue<string>(metadata, "correlationId"),
      timestamp: entry.timestamp,
    },
  ];
}

function mapMarketBuyEvent(entry: EconomyAuditEntry): QuestEvent[] {
  if (entry.operationType !== "market_buy" || !entry.guildId) {
    return [];
  }

  const metadata = entry.metadata;
  const itemId =
    getMetadataValue<string>(metadata, "itemId") ?? entry.itemData?.itemId;
  if (!itemId) {
    return [];
  }

  const qty = numberFromUnknown(
    getMetadataValue<number>(metadata, "qty") ?? entry.itemData?.quantity,
    1,
  );

  return [
    {
      type: "market_buy",
      guildId: entry.guildId,
      userId: entry.actorId,
      itemId,
      qty,
      correlationId: getMetadataValue<string>(metadata, "correlationId"),
      timestamp: entry.timestamp,
    },
  ];
}

function mapFightWinEvent(entry: EconomyAuditEntry): QuestEvent[] {
  if (!entry.guildId) {
    return [];
  }

  if (
    entry.operationType !== "combat_complete" &&
    entry.operationType !== "combat_forfeit" &&
    entry.operationType !== "combat_expire"
  ) {
    return [];
  }

  return [
    {
      type: "fight_win",
      guildId: entry.guildId,
      userId: entry.actorId,
      opponentId: entry.targetId,
      correlationId: getMetadataValue<string>(entry.metadata, "correlationId"),
      timestamp: entry.timestamp,
    },
  ];
}

export function mapAuditEntryToQuestEvents(entry: EconomyAuditEntry): QuestEvent[] {
  if (entry.operationType === "quest_accept" || entry.operationType === "quest_claim") {
    return [];
  }

  if (entry.operationType === "craft") {
    return [...mapGatherEvent(entry), ...mapProcessEvent(entry), ...mapCraftEvent(entry)];
  }

  if (entry.operationType === "market_list") {
    return mapMarketListEvent(entry);
  }

  if (entry.operationType === "market_buy") {
    return mapMarketBuyEvent(entry);
  }

  if (
    entry.operationType === "combat_complete" ||
    entry.operationType === "combat_forfeit" ||
    entry.operationType === "combat_expire"
  ) {
    return mapFightWinEvent(entry);
  }

  return [];
}

export function getStepTarget(step: QuestStep): number {
  return step.qty;
}

export function getStepProgressIncrement(
  step: QuestStep,
  event: QuestEvent,
): number {
  switch (step.kind) {
    case "gather_item": {
      if (event.type !== "gather") return 0;
      if (event.action !== step.action) return 0;
      if (event.itemId !== step.itemId) return 0;

      if (
        step.locationTierMin !== undefined &&
        (event.locationTier ?? 0) < step.locationTierMin
      ) {
        return 0;
      }

      if (
        step.locationTierMax !== undefined &&
        (event.locationTier ?? Number.MAX_SAFE_INTEGER) > step.locationTierMax
      ) {
        return 0;
      }

      if (step.toolTierMin !== undefined && (event.toolTier ?? 0) < step.toolTierMin) {
        return 0;
      }

      return Math.max(0, event.qty);
    }

    case "process_item": {
      if (event.type !== "process") return 0;
      if (event.inputItemId !== step.inputItemId) return 0;
      if (step.outputItemId && event.outputItemId !== step.outputItemId) return 0;
      if (step.successOnly !== false && !event.success) return 0;
      return Math.max(0, event.qty);
    }

    case "craft_recipe": {
      if (event.type !== "craft") return 0;
      if (event.recipeId !== step.recipeId) return 0;
      return Math.max(0, event.qty);
    }

    case "market_list_item": {
      if (event.type !== "market_list") return 0;
      if (event.itemId !== step.itemId) return 0;
      return Math.max(0, event.qty);
    }

    case "market_buy_item": {
      if (event.type !== "market_buy") return 0;
      if (event.itemId !== step.itemId) return 0;
      return Math.max(0, event.qty);
    }

    case "fight_win": {
      if (event.type !== "fight_win") return 0;
      return 1;
    }

    default:
      return 0;
  }
}

export function buildStepProgressText(
  step: QuestStep,
  current: number,
): string {
  const target = getStepTarget(step);
  const safeCurrent = Math.min(target, Math.max(0, current));

  switch (step.kind) {
    case "gather_item":
      return `Gather ${step.qty}x ${step.itemId} (${safeCurrent}/${target})`;
    case "process_item":
      return `Process ${step.qty}x ${step.inputItemId}${step.outputItemId ? ` -> ${step.outputItemId}` : ""} (${safeCurrent}/${target})`;
    case "craft_recipe":
      return `Craft ${step.qty}x ${step.recipeId} (${safeCurrent}/${target})`;
    case "market_list_item":
      return `List ${step.qty}x ${step.itemId} on market (${safeCurrent}/${target})`;
    case "market_buy_item":
      return `Buy ${step.qty}x ${step.itemId} from market (${safeCurrent}/${target})`;
    case "fight_win":
      return `Win ${step.qty} fight(s) (${safeCurrent}/${target})`;
    default:
      return `${safeCurrent}/${target}`;
  }
}
