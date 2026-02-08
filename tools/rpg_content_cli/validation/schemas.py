"""Schema validation for RPG content packs.

This module validates the structure and constraints of content pack data.
Each validator returns a list of issue strings with JSON path prefixes.

Adding a new step kind requires adding validation logic in _validate_step().
"""

from __future__ import annotations

from typing import Any

from rpg_content_cli.config import (
    GATHER_ACTIONS,
    MARKET_CATEGORIES,
    QUEST_DIFFICULTIES,
    QUEST_PROFESSIONS,
    QUEST_REPEAT_KINDS,
    QUEST_STEP_KINDS,
    TIER_MAX,
    TIER_MIN,
)
from rpg_content_cli.models.common import is_valid_content_id


def _is_int(value: Any, *, min_value: int | None = None, max_value: int | None = None) -> bool:
    """Check if value is an integer within optional bounds."""
    if not isinstance(value, int) or isinstance(value, bool):
        return False
    if min_value is not None and value < min_value:
        return False
    if max_value is not None and value > max_value:
        return False
    return True


# -----------------------------------------------------------------------------
# Item Validation
# -----------------------------------------------------------------------------

def validate_item(item: Any, path: str, issues: list[str]) -> None:
    """Validate a single item definition.
    
    Args:
        item: Item dictionary to validate
        path: JSON path for error messages
        issues: List to append validation issues to
    """
    if not isinstance(item, dict):
        issues.append(f"{path}: expected object")
        return

    item_id = item.get("id")
    if not is_valid_content_id(item_id):
        issues.append(f"{path}.id: invalid id, expected ^[a-z0-9_]+$")

    if not isinstance(item.get("name"), str) or not item["name"].strip():
        issues.append(f"{path}.name: required non-empty string")
    if not isinstance(item.get("description"), str) or not item["description"].strip():
        issues.append(f"{path}.description: required non-empty string")

    max_stack = item.get("maxStack")
    if max_stack is not None and not _is_int(max_stack, min_value=1):
        issues.append(f"{path}.maxStack: expected integer >= 1")

    value = item.get("value")
    if value is not None and (not isinstance(value, (int, float)) or value < 0):
        issues.append(f"{path}.value: expected number >= 0")

    market = item.get("market")
    if market is not None:
        if not isinstance(market, dict):
            issues.append(f"{path}.market: expected object")
        else:
            if not isinstance(market.get("tradable"), bool):
                issues.append(f"{path}.market.tradable: expected boolean")
            if market.get("category") not in MARKET_CATEGORIES:
                issues.append(
                    f"{path}.market.category: expected one of {sorted(MARKET_CATEGORIES)}"
                )
            min_price = market.get("minPrice")
            max_price = market.get("maxPrice")
            if min_price is not None and not _is_int(min_price, min_value=1):
                issues.append(f"{path}.market.minPrice: expected integer >= 1")
            if max_price is not None and not _is_int(max_price, min_value=1):
                issues.append(f"{path}.market.maxPrice: expected integer >= 1")
            if (
                isinstance(min_price, int)
                and isinstance(max_price, int)
                and max_price < min_price
            ):
                issues.append(f"{path}.market.maxPrice: must be >= minPrice")


def validate_item_pack(items_pack: Any) -> list[str]:
    """Validate the items content pack.
    
    Args:
        items_pack: Parsed items pack dictionary
        
    Returns:
        List of validation issue strings
    """
    issues: list[str] = []

    if not isinstance(items_pack, dict):
        return ["$items: root must be an object"]

    if items_pack.get("schemaVersion") != 1:
        issues.append("$items.schemaVersion: expected 1")

    items = items_pack.get("items")
    if not isinstance(items, list):
        issues.append("$items.items: expected an array")
        return issues

    seen_ids: set[str] = set()
    for idx, item in enumerate(items):
        item_path = f"$items.items[{idx}]"
        if not isinstance(item, dict):
            issues.append(f"{item_path}: expected object")
            continue

        item_id = item.get("id")
        if is_valid_content_id(item_id):
            if item_id in seen_ids:
                issues.append(f"{item_path}.id: duplicate id '{item_id}'")
            seen_ids.add(item_id)

        validate_item(item, item_path, issues)

    return issues


# -----------------------------------------------------------------------------
# Recipe Validation
# -----------------------------------------------------------------------------

def validate_recipe_pack(recipes_pack: Any) -> list[str]:
    """Validate the recipes content pack.
    
    Args:
        recipes_pack: Parsed recipes pack dictionary
        
    Returns:
        List of validation issue strings
    """
    issues: list[str] = []

    if not isinstance(recipes_pack, dict):
        return ["$recipes: root must be an object"]

    if recipes_pack.get("schemaVersion") != 1:
        issues.append("$recipes.schemaVersion: expected 1")

    recipes = recipes_pack.get("recipes")
    if not isinstance(recipes, list):
        issues.append("$recipes.recipes: expected an array")
        return issues

    seen_ids: set[str] = set()
    for idx, recipe in enumerate(recipes):
        recipe_path = f"$recipes.recipes[{idx}]"
        if not isinstance(recipe, dict):
            issues.append(f"{recipe_path}: expected object")
            continue

        recipe_id = recipe.get("id")
        if not is_valid_content_id(recipe_id):
            issues.append(f"{recipe_path}.id: invalid id")
            continue

        if recipe_id in seen_ids:
            issues.append(f"{recipe_path}.id: duplicate id '{recipe_id}'")
        seen_ids.add(recipe_id)

    return issues


# -----------------------------------------------------------------------------
# Quest Step Validation
# -----------------------------------------------------------------------------

def validate_step(
    step: Any,
    path: str,
    issues: list[str],
    item_ids: set[str],
    recipe_ids: set[str],
) -> None:
    """Validate a single quest step.
    
    This is the main extension point for step validation. To add a new step kind:
    1. Add the kind string to QUEST_STEP_KINDS in config.py
    2. Add a validation branch here
    3. Add a step model variant in models/quest.py
    
    Args:
        step: Step dictionary to validate
        path: JSON path for error messages
        issues: List to append validation issues to
        item_ids: Valid item IDs for cross-reference checks
        recipe_ids: Valid recipe IDs for cross-reference checks
    """
    if not isinstance(step, dict):
        issues.append(f"{path}: step must be an object")
        return

    kind = step.get("kind")
    if kind not in QUEST_STEP_KINDS:
        issues.append(f"{path}.kind: invalid step kind '{kind}'")
        return

    if not _is_int(step.get("qty"), min_value=1):
        issues.append(f"{path}.qty: expected integer >= 1")

    # Validate by step kind
    if kind == "gather_item":
        _validate_gather_step(step, path, issues, item_ids)
    elif kind == "process_item":
        _validate_process_step(step, path, issues, item_ids)
    elif kind == "craft_recipe":
        _validate_craft_step(step, path, issues, recipe_ids)
    elif kind in {"market_list_item", "market_buy_item"}:
        _validate_market_step(step, path, issues, item_ids)
    elif kind == "fight_win":
        # No additional validation needed
        pass


def _validate_gather_step(
    step: dict[str, Any], path: str, issues: list[str], item_ids: set[str]
) -> None:
    """Validate a gather_item step."""
    if step.get("action") not in GATHER_ACTIONS:
        issues.append(f"{path}.action: expected 'mine' or 'forest'")

    item_id = step.get("itemId")
    if not is_valid_content_id(item_id):
        issues.append(f"{path}.itemId: invalid item id")
    elif item_id not in item_ids:
        issues.append(f"{path}.itemId: unknown item '{item_id}'")

    for key in ("locationTierMin", "locationTierMax", "toolTierMin"):
        value = step.get(key)
        if value is not None and not _is_int(value, min_value=TIER_MIN, max_value=TIER_MAX):
            issues.append(f"{path}.{key}: expected integer between {TIER_MIN} and {TIER_MAX}")

    tier_min = step.get("locationTierMin")
    tier_max = step.get("locationTierMax")
    if isinstance(tier_min, int) and isinstance(tier_max, int) and tier_max < tier_min:
        issues.append(f"{path}.locationTierMax: must be >= locationTierMin")


def _validate_process_step(
    step: dict[str, Any], path: str, issues: list[str], item_ids: set[str]
) -> None:
    """Validate a process_item step."""
    input_item = step.get("inputItemId")
    if not is_valid_content_id(input_item):
        issues.append(f"{path}.inputItemId: invalid item id")
    elif input_item not in item_ids:
        issues.append(f"{path}.inputItemId: unknown item '{input_item}'")

    output_item = step.get("outputItemId")
    if output_item is not None:
        if not is_valid_content_id(output_item):
            issues.append(f"{path}.outputItemId: invalid item id")
        elif output_item not in item_ids:
            issues.append(f"{path}.outputItemId: unknown item '{output_item}'")

    success_only = step.get("successOnly")
    if success_only is not None and not isinstance(success_only, bool):
        issues.append(f"{path}.successOnly: expected boolean")


def _validate_craft_step(
    step: dict[str, Any], path: str, issues: list[str], recipe_ids: set[str]
) -> None:
    """Validate a craft_recipe step."""
    recipe_id = step.get("recipeId")
    if not is_valid_content_id(recipe_id):
        issues.append(f"{path}.recipeId: invalid recipe id")
    elif recipe_id not in recipe_ids:
        issues.append(f"{path}.recipeId: unknown recipe '{recipe_id}'")


def _validate_market_step(
    step: dict[str, Any], path: str, issues: list[str], item_ids: set[str]
) -> None:
    """Validate a market_list_item or market_buy_item step."""
    item_id = step.get("itemId")
    if not is_valid_content_id(item_id):
        issues.append(f"{path}.itemId: invalid item id")
    elif item_id not in item_ids:
        issues.append(f"{path}.itemId: unknown item '{item_id}'")


# -----------------------------------------------------------------------------
# Quest Validation
# -----------------------------------------------------------------------------

def _validate_repeat(repeat: Any, path: str, issues: list[str]) -> None:
    """Validate quest repeat configuration."""
    if not isinstance(repeat, dict):
        issues.append(f"{path}: repeat must be an object")
        return

    kind = repeat.get("kind")
    if kind not in QUEST_REPEAT_KINDS:
        issues.append(f"{path}.kind: invalid repeat kind '{kind}'")
        return

    if kind == "cooldown" and not _is_int(repeat.get("hours"), min_value=1):
        issues.append(f"{path}.hours: cooldown repeat requires integer hours >= 1")


def _validate_prerequisites(
    prerequisites: Any, path: str, issues: list[str], known_quest_ids: set[str]
) -> None:
    """Validate quest prerequisites."""
    if not isinstance(prerequisites, dict):
        issues.append(f"{path}: prerequisites must be an object")
        return

    profession = prerequisites.get("profession")
    if profession is not None and profession not in QUEST_PROFESSIONS:
        issues.append(f"{path}.profession: invalid profession '{profession}'")

    min_level = prerequisites.get("minLevel")
    if min_level is not None and not _is_int(min_level, min_value=1):
        issues.append(f"{path}.minLevel: expected integer >= 1")

    requires = prerequisites.get("requiresQuestsCompleted", [])
    if not isinstance(requires, list):
        issues.append(f"{path}.requiresQuestsCompleted: expected an array")
        return

    for idx, required_id in enumerate(requires):
        req_path = f"{path}.requiresQuestsCompleted[{idx}]"
        if not is_valid_content_id(required_id):
            issues.append(f"{req_path}: invalid quest id format")
        elif required_id not in known_quest_ids:
            issues.append(f"{req_path}: unknown quest '{required_id}'")


def _validate_rewards(
    rewards: Any, path: str, issues: list[str], item_ids: set[str]
) -> None:
    """Validate quest rewards."""
    if not isinstance(rewards, dict):
        issues.append(f"{path}: rewards must be an object")
        return

    has_any_reward = False

    xp = rewards.get("xp")
    if xp is not None:
        if not _is_int(xp, min_value=0):
            issues.append(f"{path}.xp: expected integer >= 0")
        elif xp > 0:
            has_any_reward = True

    tokens = rewards.get("tokens")
    if tokens is not None:
        if not _is_int(tokens, min_value=0):
            issues.append(f"{path}.tokens: expected integer >= 0")
        elif tokens > 0:
            has_any_reward = True

    currency = rewards.get("currency", [])
    if currency is not None and not isinstance(currency, list):
        issues.append(f"{path}.currency: expected an array")
    elif isinstance(currency, list):
        if currency:
            has_any_reward = True
        for idx, reward in enumerate(currency):
            reward_path = f"{path}.currency[{idx}]"
            if not isinstance(reward, dict):
                issues.append(f"{reward_path}: expected object")
                continue
            if not is_valid_content_id(reward.get("id")):
                issues.append(f"{reward_path}.id: invalid currency id")
            if not _is_int(reward.get("amount"), min_value=1):
                issues.append(f"{reward_path}.amount: expected integer >= 1")

    items = rewards.get("items", [])
    if items is not None and not isinstance(items, list):
        issues.append(f"{path}.items: expected an array")
    elif isinstance(items, list):
        if items:
            has_any_reward = True
        for idx, reward in enumerate(items):
            reward_path = f"{path}.items[{idx}]"
            if not isinstance(reward, dict):
                issues.append(f"{reward_path}: expected object")
                continue
            item_id = reward.get("itemId")
            if not is_valid_content_id(item_id):
                issues.append(f"{reward_path}.itemId: invalid item id")
            elif item_id not in item_ids:
                issues.append(f"{reward_path}.itemId: unknown item '{item_id}'")
            if not _is_int(reward.get("qty"), min_value=1):
                issues.append(f"{reward_path}.qty: expected integer >= 1")

    if not has_any_reward:
        issues.append(f"{path}: must contain at least one non-zero reward")


def validate_quest(
    quest: Any,
    path: str,
    issues: list[str],
    quest_ids: set[str],
    item_ids: set[str],
    recipe_ids: set[str],
) -> None:
    """Validate a single quest definition.
    
    Args:
        quest: Quest dictionary to validate
        path: JSON path for error messages
        issues: List to append validation issues to
        quest_ids: All quest IDs for prerequisite cross-references
        item_ids: Valid item IDs for cross-reference checks
        recipe_ids: Valid recipe IDs for craft step checks
    """
    if not isinstance(quest, dict):
        issues.append(f"{path}: expected object")
        return

    if not isinstance(quest.get("title"), str) or not quest["title"].strip():
        issues.append(f"{path}.title: required non-empty string")
    if not isinstance(quest.get("description"), str) or not quest["description"].strip():
        issues.append(f"{path}.description: required non-empty string")
    if quest.get("difficulty", "easy") not in QUEST_DIFFICULTIES:
        issues.append(f"{path}.difficulty: invalid difficulty")

    enabled = quest.get("enabled")
    if enabled is not None and not isinstance(enabled, bool):
        issues.append(f"{path}.enabled: expected boolean")

    repeat = quest.get("repeat", {"kind": "none"})
    _validate_repeat(repeat, f"{path}.repeat", issues)

    prerequisites = quest.get("prerequisites")
    if prerequisites is not None:
        _validate_prerequisites(prerequisites, f"{path}.prerequisites", issues, quest_ids)

    steps = quest.get("steps")
    if not isinstance(steps, list) or len(steps) == 0:
        issues.append(f"{path}.steps: expected non-empty array")
    else:
        for step_idx, step in enumerate(steps):
            validate_step(step, f"{path}.steps[{step_idx}]", issues, item_ids, recipe_ids)

    _validate_rewards(quest.get("rewards"), f"{path}.rewards", issues, item_ids)


def validate_quest_pack(
    quests_pack: Any, item_ids: set[str], recipe_ids: set[str]
) -> list[str]:
    """Validate the quests content pack.
    
    Args:
        quests_pack: Parsed quests pack dictionary
        item_ids: Valid item IDs for cross-reference checks
        recipe_ids: Valid recipe IDs for craft step checks
        
    Returns:
        List of validation issue strings
    """
    issues: list[str] = []

    if not isinstance(quests_pack, dict):
        return ["$quests: root must be an object"]

    if quests_pack.get("schemaVersion") != 1:
        issues.append("$quests.schemaVersion: expected 1")

    quests = quests_pack.get("quests")
    if not isinstance(quests, list):
        issues.append("$quests.quests: expected an array")
        return issues

    # First pass: collect quest IDs
    quest_ids: set[str] = set()
    for idx, quest in enumerate(quests):
        quest_path = f"$quests.quests[{idx}]"
        if not isinstance(quest, dict):
            issues.append(f"{quest_path}: expected object")
            continue

        quest_id = quest.get("id")
        if not is_valid_content_id(quest_id):
            issues.append(f"{quest_path}.id: invalid id, expected ^[a-z0-9_]+$")
        elif quest_id in quest_ids:
            issues.append(f"{quest_path}.id: duplicate id '{quest_id}'")
        else:
            quest_ids.add(quest_id)

    # Second pass: validate quest contents
    for idx, quest in enumerate(quests):
        if not isinstance(quest, dict):
            continue
        quest_path = f"$quests.quests[{idx}]"
        validate_quest(quest, quest_path, issues, quest_ids, item_ids, recipe_ids)

    return issues


# -----------------------------------------------------------------------------
# Combined Validation
# -----------------------------------------------------------------------------

def validate_packs(
    quests_pack: Any, items_pack: Any, recipes_pack: Any
) -> list[str]:
    """Validate all content packs together.
    
    This performs schema validation for each pack and cross-reference
    validation between packs.
    
    Args:
        quests_pack: Parsed quests pack dictionary
        items_pack: Parsed items pack dictionary
        recipes_pack: Parsed recipes pack dictionary
        
    Returns:
        List of validation issue strings
    """
    issues: list[str] = []

    # Validate items and recipes first
    item_issues = validate_item_pack(items_pack)
    recipe_issues = validate_recipe_pack(recipes_pack)
    issues.extend(item_issues)
    issues.extend(recipe_issues)

    # Build ID sets for cross-reference validation
    item_ids: set[str] = set()
    if isinstance(items_pack, dict) and isinstance(items_pack.get("items"), list):
        for item in items_pack["items"]:
            if isinstance(item, dict) and is_valid_content_id(item.get("id")):
                item_ids.add(item["id"])

    recipe_ids: set[str] = set()
    if isinstance(recipes_pack, dict) and isinstance(recipes_pack.get("recipes"), list):
        for recipe in recipes_pack["recipes"]:
            if isinstance(recipe, dict) and is_valid_content_id(recipe.get("id")):
                recipe_ids.add(recipe["id"])

    # Validate quests with cross-references
    issues.extend(validate_quest_pack(quests_pack, item_ids, recipe_ids))

    return issues
