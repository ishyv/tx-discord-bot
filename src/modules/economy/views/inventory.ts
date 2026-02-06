/**
 * Inventory View Builder.
 *
 * Purpose: Build paginated, filtered, and sorted inventory views.
 * Encaje: Pure functions transforming raw inventory to display-ready views.
 * Dependencies: Item definitions registry.
 *
 * Invariants:
 * - Page boundaries are always valid (clamped to available range).
 * - Sorting is stable (name as tie-breaker).
 * - Search is case-insensitive and matches both name and ID.
 */

import {
  getItemDefinition,
  getItemCategory,
  getToolMaxDurability,
} from "@/modules/inventory/items";
import type { ModernInventory } from "@/modules/inventory/inventory";
import { getTotalQuantity } from "@/modules/inventory/instances";
import {
  type InventoryItemView,
  type InventorySummaryView,
  type InventoryPageView,
  type InventoryPaginationOptions,
  EMPTY_INVENTORY_SUMMARY,
  DEFAULT_INVENTORY_PAGINATION,
  MAX_INVENTORY_PAGE_SIZE,
} from "../account/types";

/** Convert inventory entry to view with definitions. */
function toItemView(itemId: string, rawEntry: any): InventoryItemView {
  const def = getItemDefinition(itemId);
  // Reconstruct entry type roughly if needed, or rely on properties
  const quantity = getTotalQuantity(rawEntry);
  const isInstanceBased = rawEntry.type === "instances";
  const instances = isInstanceBased
    ? rawEntry.instances.map((inst: any) => ({
      instanceId: inst.instanceId,
      durability: inst.durability,
      maxDurability: def ? (getToolMaxDurability(def) ?? 100) : 100,
    }))
    : undefined;

  return {
    id: itemId,
    name: def?.name ?? itemId,
    emoji: def?.emoji ?? "📦",
    quantity,
    description: def?.description ?? "",
    category: def ? getItemCategory(def) : "materials",
    isInstanceBased,
    instances,
  };
}

/** Get sort value for an item. */
function getSortValue(
  item: InventoryItemView,
  sortBy: NonNullable<InventoryPaginationOptions["sortBy"]>,
): string | number {
  switch (sortBy) {
    case "name":
      return item.name.toLowerCase();
    case "quantity":
      return -item.quantity; // Negative for descending default
    case "id":
      return item.id.toLowerCase();
    default:
      return item.name.toLowerCase();
  }
}

/** Filter items by search term. */
function matchesSearch(item: InventoryItemView, search: string): boolean {
  const term = search.toLowerCase().trim();
  if (!term) return true;

  return (
    item.id.toLowerCase().includes(term) ||
    item.name.toLowerCase().includes(term) ||
    item.description.toLowerCase().includes(term)
  );
}

/** Filter items by category. */
function matchesFilter(
  item: InventoryItemView,
  filter: InventoryPaginationOptions["filter"],
): boolean {
  if (!filter || filter === "all") return true;
  return item.category === filter;
}

/**
 * Build inventory summary (statistics only, no pagination).
 */
export function buildInventorySummary(
  inventory: ModernInventory,
): InventorySummaryView {
  const entries = Object.entries(inventory).filter(
    ([_, entry]) => !!entry && getTotalQuantity(entry) > 0,
  );

  if (entries.length === 0) {
    return EMPTY_INVENTORY_SUMMARY;
  }

  const views = entries.map(([id, entry]) => toItemView(id, entry));

  // Sort by quantity descending for top items
  const topItems = [...views]
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, 5);

  const totalItems = views.reduce((sum, item) => sum + item.quantity, 0);

  return {
    totalItems,
    uniqueItems: views.length,
    topItems,
    isEmpty: false,
  };
}

/**
 * Build paginated inventory view with sorting and filtering.
 */
export function buildInventoryPage(
  inventory: ModernInventory,
  options: Partial<InventoryPaginationOptions> = {},
): InventoryPageView {
  const opts = {
    ...DEFAULT_INVENTORY_PAGINATION,
    ...options,
  };

  // Clamp page size
  const pageSize = Math.min(
    Math.max(1, Math.trunc(opts.pageSize)),
    MAX_INVENTORY_PAGE_SIZE,
  );

  // Get valid items
  const entries = Object.entries(inventory).filter(
    ([_, entry]) => !!entry && getTotalQuantity(entry) > 0,
  );

  if (entries.length === 0) {
    return {
      items: [],
      page: 0,
      totalPages: 1,
      totalItems: 0,
      hasMore: false,
    };
  }

  // Convert to views
  let views = entries.map(([id, entry]) => toItemView(id, entry));

  // Apply category filter
  if (opts.filter && opts.filter !== "all") {
    views = views.filter((item) => matchesFilter(item, opts.filter));
  }

  // Apply search filter
  if (opts.search) {
    views = views.filter((item) => matchesSearch(item, opts.search!));
  }

  // Apply sorting
  views.sort((a, b) => {
    const aVal = getSortValue(a, opts.sortBy!);
    const bVal = getSortValue(b, opts.sortBy!);

    let comparison: number;
    if (typeof aVal === "number" && typeof bVal === "number") {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return opts.sortOrder === "desc" ? -comparison : comparison;
  });

  // Calculate pagination
  const totalItems = views.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(0, opts.page), totalPages - 1);

  // Slice page
  const start = page * pageSize;
  const pageItems = views.slice(start, start + pageSize);

  return {
    items: pageItems,
    page,
    totalPages,
    totalItems,
    hasMore: page < totalPages - 1,
  };
}

/**
 * Build full inventory view (all items, no pagination).
 * Useful for exports or admin views.
 */
export function buildFullInventory(
  inventory: ModernInventory,
  options: Omit<Partial<InventoryPaginationOptions>, "page"> = {},
): InventoryItemView[] {
  const entries = Object.entries(inventory).filter(
    ([_, entry]) => !!entry && getTotalQuantity(entry) > 0,
  );

  let views = entries.map(([id, entry]) => toItemView(id, entry));

  // Apply category filter
  if (options.filter && options.filter !== "all") {
    views = views.filter((item) => matchesFilter(item, options.filter));
  }

  // Apply search filter
  if (options.search) {
    views = views.filter((item) => matchesSearch(item, options.search!));
  }

  // Apply sorting
  const sortBy = options.sortBy ?? "name";
  const sortOrder = options.sortOrder ?? "asc";

  views.sort((a, b) => {
    const aVal = getSortValue(a, sortBy);
    const bVal = getSortValue(b, sortBy);

    let comparison: number;
    if (typeof aVal === "number" && typeof bVal === "number") {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return sortOrder === "desc" ? -comparison : comparison;
  });

  return views;
}

/**
 * Get pagination info without building full page.
 * Useful for checking if pagination is needed.
 */
export function getInventoryPaginationInfo(
  inventory: ModernInventory,
  pageSize: number = DEFAULT_INVENTORY_PAGINATION.pageSize,
): { totalItems: number; totalPages: number; needsPagination: boolean } {
  const entries = Object.values(inventory).filter(
    (entry) => !!entry && getTotalQuantity(entry) > 0,
  );

  const totalItems = entries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const needsPagination = totalPages > 1;

  return { totalItems, totalPages, needsPagination };
}
