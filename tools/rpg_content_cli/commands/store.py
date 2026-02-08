"""Store commands for content management.

This module provides all store-related CLI commands:
- list: Display all store items
- show: Display a single store item as JSON
- add: Add an item to the store catalog
- remove: Remove an item from the store catalog
- set: Modify a store item field by path
"""

from __future__ import annotations

import argparse
import json
import re
from typing import Any

from rpg_content_cli.config import MARKET_CATEGORIES
from rpg_content_cli.errors import (
    CliError,
    DuplicateIdError,
    InvalidValueError,
    NotFoundError,
    ValidationError,
)
from rpg_content_cli.models.common import is_valid_content_id
from rpg_content_cli.persistence import (
    get_store_path,
    load_all_packs,
    parse_content_file,
    write_content_file,
)
from rpg_content_cli.persistence.pack_paths import PackPaths
from rpg_content_cli.persistence.repositories import set_by_path


def _load_store_pack(paths: PackPaths) -> dict[str, Any]:
    """Load the store pack, creating an empty one if it doesn't exist.
    
    Args:
        paths: Resolved pack file paths
        
    Returns:
        Store pack dictionary
    """
    if paths.store is not None and paths.store.exists():
        return parse_content_file(paths.store)
    
    # Return empty store structure
    return {
        "schemaVersion": 1,
        "items": [],
    }


def _get_store_path(paths: PackPaths) -> Any:
    """Get the store file path, using existing or default."""
    if paths.store is not None:
        return paths.store
    return get_store_path(paths.pack_dir)


def _save_store_pack(paths: PackPaths, store_pack: dict[str, Any]) -> None:
    """Save the store pack to disk.
    
    Args:
        paths: Resolved pack file paths
        store_pack: Store pack dictionary to save
    """
    store_path = _get_store_path(paths)
    write_content_file(store_path, store_pack)


def _validate_store_pack(store_pack: dict[str, Any], item_ids: set[str]) -> list[str]:
    """Validate the store pack structure.
    
    Args:
        store_pack: Store pack dictionary to validate
        item_ids: Valid item IDs for cross-reference checks
        
    Returns:
        List of validation issue strings
    """
    issues: list[str] = []
    
    if not isinstance(store_pack, dict):
        return ["$store: root must be an object"]
    
    if store_pack.get("schemaVersion") != 1:
        issues.append("$store.schemaVersion: expected 1")
    
    items = store_pack.get("items")
    if not isinstance(items, list):
        issues.append("$store.items: expected an array")
        return issues
    
    seen_ids: set[str] = set()
    for idx, item in enumerate(items):
        item_path = f"$store.items[{idx}]"
        if not isinstance(item, dict):
            issues.append(f"{item_path}: expected object")
            continue
        
        # Check itemId
        item_id = item.get("itemId")
        if not is_valid_content_id(item_id):
            issues.append(f"{item_path}.itemId: invalid item id")
        elif item_id in seen_ids:
            issues.append(f"{item_path}.itemId: duplicate item '{item_id}'")
        elif item_id not in item_ids:
            issues.append(f"{item_path}.itemId: unknown item '{item_id}'")
        else:
            seen_ids.add(item_id)
        
        # Check required fields
        if not isinstance(item.get("name"), str) or not item["name"].strip():
            issues.append(f"{item_path}.name: required non-empty string")
        
        buy_price = item.get("buyPrice")
        if not isinstance(buy_price, int) or buy_price < 1:
            issues.append(f"{item_path}.buyPrice: expected integer >= 1")
        
        sell_price = item.get("sellPrice")
        if not isinstance(sell_price, int) or sell_price < 1:
            issues.append(f"{item_path}.sellPrice: expected integer >= 1")
        
        # Check optional fields
        stock = item.get("stock", -1)
        if not isinstance(stock, int) or stock < -1:
            issues.append(f"{item_path}.stock: expected integer >= -1")
        
        available = item.get("available", True)
        if not isinstance(available, bool):
            issues.append(f"{item_path}.available: expected boolean")
        
        category = item.get("category")
        if category is not None and category not in MARKET_CATEGORIES:
            issues.append(f"{item_path}.category: expected one of {sorted(MARKET_CATEGORIES)}")
        
        purchase_limit = item.get("purchaseLimit", 0)
        if not isinstance(purchase_limit, int) or purchase_limit < 0:
            issues.append(f"{item_path}.purchaseLimit: expected integer >= 0")
    
    return issues


def _parse_cli_value(raw: str) -> Any:
    """Parse a CLI value string into a typed Python value."""
    value = raw.strip()
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    if value.lower() == "null":
        return None
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    if value.startswith("{") or value.startswith("[") or value.startswith('"'):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise InvalidValueError(value, f"Invalid JSON: {exc}") from exc
    return raw


def cmd_store_list(paths: PackPaths, _args: argparse.Namespace) -> int:
    """List all store items with summary information.
    
    Displays each store item with: item_id, buy_price, sell_price, stock, available, name.
    
    Args:
        paths: Resolved pack file paths
        _args: CLI arguments (unused)
        
    Returns:
        0 on success
    """
    store_pack = _load_store_pack(paths)
    items = store_pack.get("items", [])
    
    if not items:
        print("No store items found. Use 'store add' to add items.")
        return 0
    
    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("itemId", "<missing>")
        name = item.get("name", "<missing>")
        buy_price = item.get("buyPrice", 0)
        sell_price = item.get("sellPrice", 0)
        stock = item.get("stock", -1)
        available = item.get("available", True)
        stock_text = "∞" if stock < 0 else str(stock)
        status = "✓" if available else "✗"
        print(f"{item_id:25} | buy={buy_price:>6} | sell={sell_price:>6} | stock={stock_text:>4} | {status} | {name}")
    
    return 0


def cmd_store_show(paths: PackPaths, args: argparse.Namespace) -> int:
    """Display a single store item as formatted JSON.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item_id
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If store item doesn't exist
    """
    store_pack = _load_store_pack(paths)
    items = store_pack.get("items", [])
    
    for item in items:
        if isinstance(item, dict) and item.get("itemId") == args.item_id:
            print(json.dumps(item, indent=2, ensure_ascii=False))
            return 0
    
    raise NotFoundError("Store item", args.item_id)


def cmd_store_add(paths: PackPaths, args: argparse.Namespace) -> int:
    """Add an item to the store catalog.
    
    The item must already exist in the items pack.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with store item creation parameters
        
    Returns:
        0 on success
        
    Raises:
        DuplicateIdError: If item is already in store
        NotFoundError: If item doesn't exist in items pack
        ValidationError: If resulting store is invalid
    """
    # Load all packs to get valid item IDs
    packs = load_all_packs(paths)
    store_pack = _load_store_pack(paths)
    items = store_pack.setdefault("items", [])
    
    # Check if item exists in items pack
    if args.item_id not in packs.item_ids:
        raise NotFoundError("Item", args.item_id)
    
    # Check if item is already in store
    for item in items:
        if isinstance(item, dict) and item.get("itemId") == args.item_id:
            raise DuplicateIdError("Store item", args.item_id)
    
    # Get item definition for defaults
    _, item_def = packs.find_item(args.item_id)
    default_name = item_def.get("name", args.item_id)
    default_value = item_def.get("value", 10)
    
    # Build store item
    store_item: dict[str, Any] = {
        "itemId": args.item_id,
        "name": args.name if args.name else default_name,
        "buyPrice": args.buy_price if args.buy_price is not None else default_value,
        "sellPrice": args.sell_price if args.sell_price is not None else int(default_value * 0.85),
        "stock": args.stock,
        "available": not args.unavailable,
    }
    
    if args.description:
        store_item["description"] = args.description
    if args.category:
        store_item["category"] = args.category
    if args.purchase_limit and args.purchase_limit > 0:
        store_item["purchaseLimit"] = args.purchase_limit
    if args.required_role:
        store_item["requiredRole"] = args.required_role
    
    items.append(store_item)
    
    # Validate
    issues = _validate_store_pack(store_pack, packs.item_ids)
    if issues:
        raise ValidationError(issues)
    
    _save_store_pack(paths, store_pack)
    store_path = _get_store_path(paths)
    print(f"Added '{args.item_id}' to store in {store_path}")
    return 0


def cmd_store_remove(paths: PackPaths, args: argparse.Namespace) -> int:
    """Remove an item from the store catalog.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item_id
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If store item doesn't exist
    """
    store_pack = _load_store_pack(paths)
    items = store_pack.get("items", [])
    
    for idx, item in enumerate(items):
        if isinstance(item, dict) and item.get("itemId") == args.item_id:
            items.pop(idx)
            _save_store_pack(paths, store_pack)
            print(f"Removed '{args.item_id}' from store")
            return 0
    
    raise NotFoundError("Store item", args.item_id)


def cmd_store_set(paths: PackPaths, args: argparse.Namespace) -> int:
    """Set a store item field by JSON path.
    
    Examples:
        --path buyPrice --value 150
        --path available --value false
        --path stock --value 50
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item_id, path, value
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If store item doesn't exist
        ValidationError: If modification results in invalid store
    """
    packs = load_all_packs(paths)
    store_pack = _load_store_pack(paths)
    items = store_pack.get("items", [])
    
    for item in items:
        if isinstance(item, dict) and item.get("itemId") == args.item_id:
            set_by_path(item, args.path, _parse_cli_value(args.value))
            
            # Validate
            issues = _validate_store_pack(store_pack, packs.item_ids)
            if issues:
                raise ValidationError(issues)
            
            _save_store_pack(paths, store_pack)
            print(f"Updated store item '{args.item_id}' at path '{args.path}'")
            return 0
    
    raise NotFoundError("Store item", args.item_id)
