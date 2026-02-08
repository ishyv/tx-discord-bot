#!/usr/bin/env python3
"""CLI entry point for RPG content pack management.

This module provides the argument parser and main entry point that
wires together all commands from the commands package.

Usage:
    python -m rpg_content_cli validate
    python -m rpg_content_cli quests list
    python -m rpg_content_cli quests create my_quest --title "My Quest" --description "..."
    python -m rpg_content_cli items list
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from rpg_content_cli.commands import (
    cmd_items_create,
    cmd_items_delete,
    cmd_items_list,
    cmd_items_set,
    cmd_items_show,
    cmd_items_unset,
    cmd_quests_create,
    cmd_quests_delete,
    cmd_quests_list,
    cmd_quests_set,
    cmd_quests_show,
    cmd_quests_step_add,
    cmd_quests_step_remove,
    cmd_quests_unset,
    cmd_store_add,
    cmd_store_list,
    cmd_store_remove,
    cmd_store_set,
    cmd_store_show,
    cmd_validate,
)
from rpg_content_cli.config import (
    MARKET_CATEGORIES,
    QUEST_DIFFICULTIES,
    QUEST_PROFESSIONS,
    QUEST_REPEAT_KINDS,
    QUEST_STEP_KINDS,
)
from rpg_content_cli.errors import CliError
from rpg_content_cli.persistence import resolve_pack_paths


def _configure_stdio_utf8() -> None:
    """Ensure emoji-containing JSON can be printed on Windows terminals.
    
    Windows consoles may default to a code page that can't handle Unicode.
    This reconfigures stdout/stderr to use UTF-8 if possible.
    """
    stdout = getattr(sys, "stdout", None)
    stderr = getattr(sys, "stderr", None)
    if hasattr(stdout, "reconfigure"):
        stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    if hasattr(stderr, "reconfigure"):
        stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


def build_parser() -> argparse.ArgumentParser:
    """Build the complete argument parser with all subcommands.
    
    Returns:
        Configured ArgumentParser with subcommands for:
        - validate
        - quests (list, show, create, delete, set, unset, step-add, step-remove)
        - items (list, show, create, delete, set, unset)
        - store (list, show, add, remove, set)
    """
    parser = argparse.ArgumentParser(
        description="Manage RPG quests and items content packs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  rpg_content_cli validate
  rpg_content_cli quests list
  rpg_content_cli quests create tutorial_quest --title "First Steps" --description "Learn the basics"
  rpg_content_cli quests set tutorial_quest --path difficulty --value medium
  rpg_content_cli quests step-add tutorial_quest --kind gather_item --param itemId=stone_ore --qty 5
  rpg_content_cli items list
  rpg_content_cli items create iron_ingot --name "Iron Ingot" --description "Refined iron"
  rpg_content_cli store list
  rpg_content_cli store add pyrite_ore --buy-price 50 --sell-price 40
""",
    )
    parser.add_argument(
        "--pack-dir",
        type=Path,
        default=Path("content/packs"),
        help="Directory containing content packs (default: content/packs).",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # ---------------------------------------------------------------------
    # validate command
    # ---------------------------------------------------------------------
    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate quests/items/recipes packs for schema and cross-reference errors.",
    )
    validate_parser.set_defaults(handler=cmd_validate)

    # ---------------------------------------------------------------------
    # quests command group
    # ---------------------------------------------------------------------
    quests_parser = subparsers.add_parser("quests", help="Quest operations.")
    quests_sub = quests_parser.add_subparsers(dest="quests_command", required=True)

    # quests list
    quests_list = quests_sub.add_parser("list", help="List all quests.")
    quests_list.set_defaults(handler=cmd_quests_list)

    # quests show
    quests_show = quests_sub.add_parser("show", help="Show one quest as JSON.")
    quests_show.add_argument("quest_id", help="ID of the quest to display.")
    quests_show.set_defaults(handler=cmd_quests_show)

    # quests create
    quests_create = quests_sub.add_parser(
        "create",
        help="Create a quest skeleton with default structure.",
    )
    quests_create.add_argument("id", help="Unique quest ID (lowercase, underscores, digits).")
    quests_create.add_argument("--title", required=True, help="Quest title shown to players.")
    quests_create.add_argument("--description", required=True, help="Quest description.")
    quests_create.add_argument("--icon", default="📜", help="Quest icon emoji.")
    quests_create.add_argument(
        "--difficulty",
        choices=sorted(QUEST_DIFFICULTIES),
        default="easy",
        help="Quest difficulty level.",
    )
    quests_create.add_argument(
        "--repeat-kind",
        choices=sorted(QUEST_REPEAT_KINDS),
        default="none",
        help="Quest repeatability mode.",
    )
    quests_create.add_argument(
        "--repeat-hours",
        type=int,
        default=24,
        help="Cooldown hours (only used with --repeat-kind=cooldown).",
    )
    quests_create.add_argument(
        "--profession",
        choices=sorted(QUEST_PROFESSIONS),
        help="Required profession prerequisite.",
    )
    quests_create.add_argument(
        "--min-level",
        type=int,
        help="Minimum level prerequisite.",
    )
    quests_create.add_argument(
        "--requires",
        help="Comma-separated quest IDs that must be completed first.",
    )
    quests_create.add_argument(
        "--coins",
        type=int,
        default=100,
        help="Default coin reward amount.",
    )
    quests_create.add_argument(
        "--xp",
        type=int,
        default=50,
        help="Default XP reward amount.",
    )
    quests_create.add_argument(
        "--disabled",
        action="store_true",
        help="Create quest in disabled state.",
    )
    quests_create.set_defaults(handler=cmd_quests_create)

    # quests delete
    quests_delete = quests_sub.add_parser("delete", help="Delete a quest.")
    quests_delete.add_argument("quest_id", help="ID of the quest to delete.")
    quests_delete.set_defaults(handler=cmd_quests_delete)

    # quests set
    quests_set = quests_sub.add_parser(
        "set",
        help="Set a quest field using JSON path (e.g. steps[0].itemId).",
    )
    quests_set.add_argument("quest_id", help="ID of the quest to modify.")
    quests_set.add_argument("--path", required=True, help="JSON path to the field.")
    quests_set.add_argument("--value", required=True, help="Value to set (auto-typed).")
    quests_set.set_defaults(handler=cmd_quests_set)

    # quests unset
    quests_unset = quests_sub.add_parser(
        "unset",
        help="Delete a quest field using JSON path (e.g. prerequisites.profession).",
    )
    quests_unset.add_argument("quest_id", help="ID of the quest to modify.")
    quests_unset.add_argument("--path", required=True, help="JSON path to remove.")
    quests_unset.set_defaults(handler=cmd_quests_unset)

    # quests step-add
    quests_step_add = quests_sub.add_parser(
        "step-add",
        help="Append a quest step.",
    )
    quests_step_add.add_argument("quest_id", help="ID of the quest.")
    quests_step_add.add_argument(
        "--kind",
        choices=sorted(QUEST_STEP_KINDS),
        required=True,
        help="Step kind.",
    )
    quests_step_add.add_argument(
        "--qty",
        type=int,
        default=1,
        help="Quantity required for step completion.",
    )
    quests_step_add.add_argument(
        "--param",
        action="append",
        default=[],
        help="Additional step field as key=value. Can be repeated.",
    )
    quests_step_add.set_defaults(handler=cmd_quests_step_add)

    # quests step-remove
    quests_step_remove = quests_sub.add_parser(
        "step-remove",
        help="Remove a step by index.",
    )
    quests_step_remove.add_argument("quest_id", help="ID of the quest.")
    quests_step_remove.add_argument(
        "--index",
        type=int,
        required=True,
        help="Zero-based index of step to remove.",
    )
    quests_step_remove.set_defaults(handler=cmd_quests_step_remove)

    # ---------------------------------------------------------------------
    # items command group
    # ---------------------------------------------------------------------
    items_parser = subparsers.add_parser("items", help="Item operations.")
    items_sub = items_parser.add_subparsers(dest="items_command", required=True)

    # items list
    items_list = items_sub.add_parser("list", help="List all items.")
    items_list.set_defaults(handler=cmd_items_list)

    # items show
    items_show = items_sub.add_parser("show", help="Show one item as JSON.")
    items_show.add_argument("item_id", help="ID of the item to display.")
    items_show.set_defaults(handler=cmd_items_show)

    # items create
    items_create = items_sub.add_parser("create", help="Create an item.")
    items_create.add_argument("id", help="Unique item ID (lowercase, underscores, digits).")
    items_create.add_argument("--name", required=True, help="Item display name.")
    items_create.add_argument("--description", required=True, help="Item description.")
    items_create.add_argument("--emoji", default=":package:", help="Item emoji.")
    items_create.add_argument(
        "--max-stack",
        type=int,
        default=99,
        help="Maximum stack size.",
    )
    items_create.add_argument(
        "--weight",
        type=float,
        default=1,
        help="Item weight.",
    )
    items_create.add_argument(
        "--can-stack",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Whether item can stack in inventory.",
    )
    items_create.add_argument(
        "--value",
        type=int,
        default=1,
        help="Base item value.",
    )
    items_create.add_argument(
        "--tradable",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Whether item can be traded on market.",
    )
    items_create.add_argument(
        "--category",
        choices=sorted(MARKET_CATEGORIES),
        default="materials",
        help="Market category.",
    )
    items_create.add_argument(
        "--suggested-price",
        type=int,
        help="Suggested market price (defaults to value).",
    )
    items_create.add_argument(
        "--min-price",
        type=int,
        default=1,
        help="Minimum market price.",
    )
    items_create.add_argument(
        "--max-price",
        type=int,
        default=5000,
        help="Maximum market price.",
    )
    items_create.set_defaults(handler=cmd_items_create)

    # items delete
    items_delete = items_sub.add_parser("delete", help="Delete an item.")
    items_delete.add_argument("item_id", help="ID of the item to delete.")
    items_delete.set_defaults(handler=cmd_items_delete)

    # items set
    items_set = items_sub.add_parser(
        "set",
        help="Set an item field using JSON path (e.g. market.suggestedPrice).",
    )
    items_set.add_argument("item_id", help="ID of the item to modify.")
    items_set.add_argument("--path", required=True, help="JSON path to the field.")
    items_set.add_argument("--value", required=True, help="Value to set (auto-typed).")
    items_set.set_defaults(handler=cmd_items_set)

    # items unset
    items_unset = items_sub.add_parser(
        "unset",
        help="Delete an item field using JSON path (e.g. market.maxPrice).",
    )
    items_unset.add_argument("item_id", help="ID of the item to modify.")
    items_unset.add_argument("--path", required=True, help="JSON path to remove.")
    items_unset.set_defaults(handler=cmd_items_unset)

    # ---------------------------------------------------------------------
    # store command group
    # ---------------------------------------------------------------------
    store_parser = subparsers.add_parser("store", help="Store catalog operations.")
    store_sub = store_parser.add_subparsers(dest="store_command", required=True)

    # store list
    store_list = store_sub.add_parser("list", help="List all store items.")
    store_list.set_defaults(handler=cmd_store_list)

    # store show
    store_show = store_sub.add_parser("show", help="Show one store item as JSON.")
    store_show.add_argument("item_id", help="ID of the store item to display.")
    store_show.set_defaults(handler=cmd_store_show)

    # store add
    store_add = store_sub.add_parser(
        "add",
        help="Add an item to the store catalog (item must exist in items pack).",
    )
    store_add.add_argument("item_id", help="ID of the item to add to store.")
    store_add.add_argument("--name", help="Display name override.")
    store_add.add_argument("--description", help="Description override.")
    store_add.add_argument(
        "--buy-price",
        type=int,
        help="Purchase price (defaults to item value).",
    )
    store_add.add_argument(
        "--sell-price",
        type=int,
        help="Sell price (defaults to 85%% of buy price).",
    )
    store_add.add_argument(
        "--stock",
        type=int,
        default=-1,
        help="Available stock (-1 for unlimited).",
    )
    store_add.add_argument(
        "--unavailable",
        action="store_true",
        help="Mark item as unavailable.",
    )
    store_add.add_argument(
        "--category",
        choices=sorted(MARKET_CATEGORIES),
        help="Store category.",
    )
    store_add.add_argument(
        "--purchase-limit",
        type=int,
        default=0,
        help="Per-user purchase limit (0 for unlimited).",
    )
    store_add.add_argument(
        "--required-role",
        help="Role ID required to purchase.",
    )
    store_add.set_defaults(handler=cmd_store_add)

    # store remove
    store_remove = store_sub.add_parser("remove", help="Remove an item from the store.")
    store_remove.add_argument("item_id", help="ID of the store item to remove.")
    store_remove.set_defaults(handler=cmd_store_remove)

    # store set
    store_set = store_sub.add_parser(
        "set",
        help="Set a store item field (e.g. buyPrice, available).",
    )
    store_set.add_argument("item_id", help="ID of the store item to modify.")
    store_set.add_argument("--path", required=True, help="JSON path to the field.")
    store_set.add_argument("--value", required=True, help="Value to set (auto-typed).")
    store_set.set_defaults(handler=cmd_store_set)

    return parser


def main(argv: list[str] | None = None) -> int:
    """Main entry point for the CLI.
    
    Args:
        argv: Command-line arguments (defaults to sys.argv[1:])
        
    Returns:
        Exit code (0 for success, 1 for error)
        
    Handles:
        - CliError: User-facing error messages
        - FileNotFoundError: Missing pack files
        - JSONDecodeError: Invalid JSON in pack files
    """
    _configure_stdio_utf8()
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        paths = resolve_pack_paths(args.pack_dir)
        handler = getattr(args, "handler", None)
        if handler is None:
            parser.print_help()
            return 1
        return int(handler(paths, args))
    except CliError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except FileNotFoundError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as error:
        print(f"Error: Invalid JSON in pack file: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
