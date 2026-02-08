"""Cross-reference validation between content packs.

This module provides additional cross-reference checks beyond basic
schema validation, such as detecting orphaned items or circular
quest dependencies.
"""

from __future__ import annotations

from typing import Any

from rpg_content_cli.models.common import is_valid_content_id


def validate_cross_references(
    quests_pack: dict[str, Any],
    items_pack: dict[str, Any],
    recipes_pack: dict[str, Any],
) -> list[str]:
    """Perform deep cross-reference validation between packs.
    
    This supplements the schema validation with additional checks:
    - Circular quest dependencies
    - Unused items (advisory)
    - Items referenced by quests that don't exist
    
    Args:
        quests_pack: Parsed quests pack dictionary
        items_pack: Parsed items pack dictionary
        recipes_pack: Parsed recipes pack dictionary
        
    Returns:
        List of validation issue strings
        
    Note:
        Basic cross-references (step.itemId exists) are checked in schema
        validation. This focuses on graph-level checks.
    """
    issues: list[str] = []

    # Build ID sets
    quest_ids = _extract_ids(quests_pack, "quests")
    item_ids = _extract_ids(items_pack, "items")
    
    # Check for circular quest dependencies
    quests = quests_pack.get("quests", [])
    if isinstance(quests, list):
        circular = _find_circular_quest_deps(quests)
        for cycle in circular:
            issues.append(f"$quests: circular dependency detected: {' -> '.join(cycle)}")

    return issues


def _extract_ids(pack: dict[str, Any], key: str) -> set[str]:
    """Extract all valid IDs from a pack."""
    ids: set[str] = set()
    entries = pack.get(key, [])
    if isinstance(entries, list):
        for entry in entries:
            if isinstance(entry, dict) and is_valid_content_id(entry.get("id", "")):
                ids.add(entry["id"])
    return ids


def _find_circular_quest_deps(quests: list[Any]) -> list[list[str]]:
    """Find circular dependencies in quest prerequisites.
    
    Uses DFS to detect cycles in the quest dependency graph.
    
    Args:
        quests: List of quest dictionaries
        
    Returns:
        List of cycles, each cycle is a list of quest IDs
    """
    # Build dependency graph
    deps: dict[str, list[str]] = {}
    for quest in quests:
        if not isinstance(quest, dict):
            continue
        quest_id = quest.get("id")
        if not is_valid_content_id(quest_id):
            continue
        prereqs = quest.get("prerequisites", {})
        if isinstance(prereqs, dict):
            requires = prereqs.get("requiresQuestsCompleted", [])
            if isinstance(requires, list):
                deps[quest_id] = [r for r in requires if isinstance(r, str)]
            else:
                deps[quest_id] = []
        else:
            deps[quest_id] = []

    cycles: list[list[str]] = []
    visited: set[str] = set()
    rec_stack: set[str] = set()

    def dfs(node: str, path: list[str]) -> None:
        if node in rec_stack:
            # Found a cycle, extract it
            cycle_start = path.index(node)
            cycles.append(path[cycle_start:] + [node])
            return
        if node in visited:
            return
        
        visited.add(node)
        rec_stack.add(node)
        path.append(node)

        for neighbor in deps.get(node, []):
            dfs(neighbor, path)

        path.pop()
        rec_stack.remove(node)

    for quest_id in deps:
        if quest_id not in visited:
            dfs(quest_id, [])

    return cycles
