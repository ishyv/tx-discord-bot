"""Quest commands for content management.

This module provides all quest-related CLI commands:
- list: Display all quests
- show: Display a single quest as JSON
- create: Create a new quest skeleton
- delete: Remove a quest
- set: Modify a quest field by path
- unset: Remove a quest field by path
- step-add: Append a step to a quest
- step-remove: Remove a step by index
"""

from __future__ import annotations

import argparse
import json
from typing import Any, Iterable

from rpg_content_cli.errors import (
    CliError,
    DuplicateIdError,
    InvalidValueError,
    ValidationError,
)
from rpg_content_cli.models.common import is_valid_content_id
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
    import re
    
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


def _parse_param_pairs(raw_params: Iterable[str]) -> dict[str, Any]:
    """Parse key=value parameter pairs.
    
    Args:
        raw_params: Iterable of "key=value" strings
        
    Returns:
        Dictionary of parsed parameters
        
    Raises:
        CliError: If format is invalid
    """
    params: dict[str, Any] = {}
    for raw_param in raw_params:
        if "=" not in raw_param:
            raise CliError(f"Invalid --param '{raw_param}'. Expected key=value")
        key, raw_value = raw_param.split("=", 1)
        key = key.strip()
        if not key:
            raise CliError(f"Invalid --param '{raw_param}'. Key cannot be empty")
        params[key] = _parse_cli_value(raw_value)
    return params


def cmd_quests_list(paths: PackPaths, _args: argparse.Namespace) -> int:
    """List all quests with summary information.
    
    Displays each quest with: id, difficulty, step count, enabled status, title.
    
    Args:
        paths: Resolved pack file paths
        _args: CLI arguments (unused)
        
    Returns:
        0 on success
    """
    packs = load_all_packs(paths)
    quests = packs.get_quests()

    if not quests:
        print("No quests found.")
        return 0

    for quest in quests:
        if not isinstance(quest, dict):
            continue
        quest_id = quest.get("id", "<missing-id>")
        title = quest.get("title", "<missing-title>")
        difficulty = quest.get("difficulty", "easy")
        step_count = len(quest.get("steps", [])) if isinstance(quest.get("steps"), list) else 0
        enabled = quest.get("enabled", True)
        print(f"{quest_id:35} | {difficulty:9} | steps={step_count:2} | enabled={enabled} | {title}")

    return 0


def cmd_quests_show(paths: PackPaths, args: argparse.Namespace) -> int:
    """Display a single quest as formatted JSON.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with quest_id
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If quest doesn't exist
    """
    packs = load_all_packs(paths)
    _, quest = packs.find_quest(args.quest_id)
    print(json.dumps(quest, indent=2, ensure_ascii=False))
    return 0


def _default_gather_step(default_item_id: str) -> dict[str, Any]:
    """Create a default gather_item step for new quests."""
    return {
        "kind": "gather_item",
        "action": "mine",
        "itemId": default_item_id,
        "qty": 1,
        "locationTierMin": 1,
    }


def cmd_quests_create(paths: PackPaths, args: argparse.Namespace) -> int:
    """Create a new quest with default structure.
    
    Creates a quest skeleton with a single gather step and basic rewards.
    The quest can then be customized using set/step-add commands.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with quest creation parameters
        
    Returns:
        0 on success
        
    Raises:
        DuplicateIdError: If quest ID already exists
        ValidationError: If resulting quest is invalid
    """
    packs = load_all_packs(paths)
    quests = packs.get_quests()

    if any(isinstance(q, dict) and q.get("id") == args.id for q in quests):
        raise DuplicateIdError("Quest", args.id)

    # Find a default item ID from items pack
    items = packs.get_items()
    default_item_id = "pyrite_ore"
    for item in items:
        if isinstance(item, dict) and is_valid_content_id(item.get("id", "")):
            default_item_id = item["id"]
            break

    # Build repeat configuration
    repeat: dict[str, Any] = {"kind": args.repeat_kind}
    if args.repeat_kind == "cooldown":
        repeat["hours"] = args.repeat_hours

    # Build prerequisites
    prerequisites: dict[str, Any] = {}
    if args.profession is not None:
        prerequisites["profession"] = args.profession
    if args.min_level is not None:
        prerequisites["minLevel"] = args.min_level
    if args.requires:
        prerequisites["requiresQuestsCompleted"] = [
            part.strip() for part in args.requires.split(",") if part.strip()
        ]

    # Build quest
    quest: dict[str, Any] = {
        "id": args.id,
        "title": args.title,
        "icon": args.icon,
        "description": args.description,
        "repeat": repeat,
        "difficulty": args.difficulty,
        "enabled": not args.disabled,
        "steps": [_default_gather_step(default_item_id)],
        "rewards": {
            "currency": [{"id": "coins", "amount": args.coins}],
            "xp": args.xp,
        },
    }
    if prerequisites:
        quest["prerequisites"] = prerequisites

    quests.append(quest)
    _save_if_valid(packs, write_quests=True)
    print(f"Created quest '{args.id}' in {paths.quests}")
    return 0


def cmd_quests_delete(paths: PackPaths, args: argparse.Namespace) -> int:
    """Delete a quest by ID.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with quest_id
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If quest doesn't exist
    """
    packs = load_all_packs(paths)
    quests = packs.get_quests()
    index, _ = packs.find_quest(args.quest_id)
    quests.pop(index)
    _save_if_valid(packs, write_quests=True)
    print(f"Deleted quest '{args.quest_id}'")
    return 0


def cmd_quests_set(paths: PackPaths, args: argparse.Namespace) -> int:
    """Set a quest field by JSON path.
    
    Examples:
        --path steps[0].itemId --value stone_ore
        --path difficulty --value hard
        --path rewards.xp --value 100
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with quest_id, path, value
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If quest doesn't exist
        InvalidPathError: If path syntax is invalid
        ValidationError: If modification results in invalid quest
    """
    packs = load_all_packs(paths)
    _, quest = packs.find_quest(args.quest_id)
    set_by_path(quest, args.path, _parse_cli_value(args.value))
    _save_if_valid(packs, write_quests=True)
    print(f"Updated quest '{args.quest_id}' at path '{args.path}'")
    return 0


def cmd_quests_unset(paths: PackPaths, args: argparse.Namespace) -> int:
    """Remove a quest field by JSON path.
    
    Examples:
        --path prerequisites.profession
        --path steps[2]
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with quest_id, path
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If quest doesn't exist
        InvalidPathError: If path syntax is invalid
        PathAccessError: If path doesn't exist
        ValidationError: If modification results in invalid quest
    """
    packs = load_all_packs(paths)
    _, quest = packs.find_quest(args.quest_id)
    delete_by_path(quest, args.path)
    _save_if_valid(packs, write_quests=True)
    print(f"Removed path '{args.path}' from quest '{args.quest_id}'")
    return 0


def cmd_quests_step_add(paths: PackPaths, args: argparse.Namespace) -> int:
    """Append a step to a quest.
    
    Use --param to set step-specific fields.
    
    Examples:
        --kind gather_item --qty 5 --param action=mine --param itemId=stone_ore
        --kind craft_recipe --qty 1 --param recipeId=iron_sword
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with quest_id, kind, qty, param
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If quest doesn't exist
        CliError: If step structure is invalid
        ValidationError: If modification results in invalid quest
    """
    packs = load_all_packs(paths)
    _, quest = packs.find_quest(args.quest_id)

    steps = quest.setdefault("steps", [])
    if not isinstance(steps, list):
        raise CliError("Quest is invalid: steps must be an array")

    new_step: dict[str, Any] = {"kind": args.kind, "qty": args.qty}
    new_step.update(_parse_param_pairs(args.param))
    steps.append(new_step)

    _save_if_valid(packs, write_quests=True)
    print(f"Added step '{args.kind}' to quest '{args.quest_id}'")
    return 0


def cmd_quests_step_remove(paths: PackPaths, args: argparse.Namespace) -> int:
    """Remove a step from a quest by index.
    
    Args:
        paths: Resolved pack file paths
        args: CLI arguments with quest_id, index
        
    Returns:
        0 on success
        
    Raises:
        NotFoundError: If quest doesn't exist
        CliError: If index is out of bounds
        ValidationError: If modification results in invalid quest
    """
    packs = load_all_packs(paths)
    _, quest = packs.find_quest(args.quest_id)

    steps = quest.get("steps")
    if not isinstance(steps, list):
        raise CliError("Quest is invalid: steps must be an array")
    if args.index < 0 or args.index >= len(steps):
        raise CliError(f"Step index {args.index} out of bounds (size={len(steps)})")

    steps.pop(args.index)
    _save_if_valid(packs, write_quests=True)
    print(f"Removed step index {args.index} from quest '{args.quest_id}'")
    return 0
