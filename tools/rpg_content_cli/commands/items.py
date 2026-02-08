"""Item commands for content management.

This module provides all item-related CLI commands:
- list: Display all items
- show: Display a single item as JSON
- create: Create a new item
- delete: Remove an item
- set: Modify an item field by path
- unset: Remove an item field by path
"""

from __future__ import annotations

import argparse
import json
import re
from typing import Any

from rpg_content_cli.errors import (
    DuplicateIdError,
    InvalidValueError,
    ValidationError,
)
from rpg_content_cli.persistence import load_all_packs
from rpg_content_cli.persistence.pack_paths import PackPaths
from rpg_content_cli.persistence.repositories import (
    delete_by_path,
    set_by_path,
)
from rpg_content_cli.validation import validate_packs


def _save_if_valid(packs: Any, *, write_quests: bool = False, write_items: bool = False) -> None:
    """Validate and save modified packs.
    
    Args:
        packs: ContentPacks instance
        write_quests: Whether to save the quests pack
        write_items: Whether to save the items pack
        
    Raises:
        ValidationError: If validation fails after the modification
    """
    issues = validate_packs(packs.quests_pack, packs.items_pack, packs.recipes_pack)
    if issues:
        raise ValidationError(issues)

    if write_quests:
        packs.save_quests()
    if write_items:
        packs.save_items()


def _parse_cli_value(raw: str) -> Any:
    """Parse a CLI value string into a typed Python value.
    
    Supports: true, false, null, integers, floats, JSON strings/arrays/objects.
    Falls back to raw string if no pattern matches.
    
    Args:
        raw: The raw CLI argument value
        
    Returns:
        Parsed Python value
        
    Raises:
        InvalidValueError: If JSON parsing fails
    """
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


def cmd_items_list(paths: PackPaths, _args: argparse.Namespace) -> int:
    """List all items with summary information.
    
    Displays each item with: id, value, category, name.
    
    Args:
        paths: Resolved pack file paths
        _args: CLI arguments (unused)
        
    Returns:
        0 on success
    """
    packs = load_all_packs(paths)
    items = packs.get_items()

    if not items:
        print("No items found.")
        return 0

    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id", "<missing-id>")
        name = item.get("name", "<missing-name>")
        value = item.get("value", 0)
        category = None
        market = item.get("market")
        if isinstance(market, dict):
            category = market.get("category")
        category_text = category if isinstance(category, str) else "-"
        print(f"{item_id:30} | value={str(value):>5} | category={category_text:11} | {name}")

    return 0


def cmd_items_show(paths: PackPaths, args: argparse.Namespace) -> int:
    """Display a single item as formatted JSON.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item_id
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If item doesn't exist
    """
    packs = load_all_packs(paths)
    _, item = packs.find_item(args.item_id)
    print(json.dumps(item, indent=2, ensure_ascii=False))
    return 0


def cmd_items_create(paths: PackPaths, args: argparse.Namespace) -> int:
    """Create a new item.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item creation parameters
        
    Returns:
        0 on success
        
    Raises:
        DuplicateIdError: If item ID already exists
        ValidationError: If resulting item is invalid
    """
    packs = load_all_packs(paths)
    items = packs.get_items()

    if any(isinstance(i, dict) and i.get("id") == args.id for i in items):
        raise DuplicateIdError("Item", args.id)

    item = {
        "id": args.id,
        "name": args.name,
        "description": args.description,
        "emoji": args.emoji,
        "maxStack": args.max_stack,
        "weight": args.weight,
        "canStack": args.can_stack,
        "value": args.value,
        "market": {
            "tradable": args.tradable,
            "category": args.category,
            "suggestedPrice": args.suggested_price if args.suggested_price is not None else max(1, args.value),
            "minPrice": args.min_price,
            "maxPrice": args.max_price,
        },
    }
    items.append(item)
    _save_if_valid(packs, write_items=True)
    print(f"Created item '{args.id}' in {paths.items}")
    return 0


def cmd_items_delete(paths: PackPaths, args: argparse.Namespace) -> int:
    """Delete an item by ID.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item_id
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If item doesn't exist
    """
    packs = load_all_packs(paths)
    items = packs.get_items()
    index, _ = packs.find_item(args.item_id)
    items.pop(index)
    _save_if_valid(packs, write_items=True)
    print(f"Deleted item '{args.item_id}'")
    return 0


def cmd_items_set(paths: PackPaths, args: argparse.Namespace) -> int:
    """Set an item field by JSON path.
    
    Examples:
        --path market.suggestedPrice --value 150
        --path value --value 50
        --path description --value "A refined ingot of iron"
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item_id, path, value
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If item doesn't exist
        InvalidPathError: If path syntax is invalid
        ValidationError: If modification results in invalid item
    """
    packs = load_all_packs(paths)
    _, item = packs.find_item(args.item_id)
    set_by_path(item, args.path, _parse_cli_value(args.value))
    _save_if_valid(packs, write_items=True)
    print(f"Updated item '{args.item_id}' at path '{args.path}'")
    return 0


def cmd_items_unset(paths: PackPaths, args: argparse.Namespace) -> int:
    """Remove an item field by JSON path.
    
    Examples:
        --path market.maxPrice
        --path weight
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with item_id, path
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If item doesn't exist
        InvalidPathError: If path syntax is invalid
        PathAccessError: If path doesn't exist
        ValidationError: If modification results in invalid item
    """
    packs = load_all_packs(paths)
    _, item = packs.find_item(args.item_id)
    delete_by_path(item, args.path)
    _save_if_valid(packs, write_items=True)
    print(f"Removed path '{args.path}' from item '{args.item_id}'")
    return 0
