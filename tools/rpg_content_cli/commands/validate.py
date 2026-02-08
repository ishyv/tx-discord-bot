"""Validate command for content pack validation.

This module provides the validate command that checks all packs for
schema conformance and cross-reference integrity.
"""

from __future__ import annotations

import argparse

from rpg_content_cli.persistence import ContentPacks, load_all_packs
from rpg_content_cli.persistence.pack_paths import PackPaths
from rpg_content_cli.validation import validate_packs


def cmd_validate(paths: PackPaths, _args: argparse.Namespace) -> int:
    """Validate all content packs.
    
    Performs schema validation and cross-reference checks on quests,
    items, and recipes packs. Prints issues if any are found.
    
    Args:
        paths: Resolved pack file paths
        _args: CLI arguments (unused)
        
    Returns:
        0 if validation passed, 1 if issues were found
        
    Output:
        On success: "OK: N quests, M items, P recipes"
        On failure: List of validation issues
    """
    packs = load_all_packs(paths)
    issues = validate_packs(packs.quests_pack, packs.items_pack, packs.recipes_pack)

    if issues:
        print("Validation failed:")
        for issue in issues:
            print(f" - {issue}")
        return 1

    quest_count = len(packs.get_quests())
    item_count = len(packs.get_items())
    recipe_count = len(packs.get_recipes())
    print(f"OK: {quest_count} quests, {item_count} items, {recipe_count} recipes")
    return 0
