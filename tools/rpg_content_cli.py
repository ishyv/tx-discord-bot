#!/usr/bin/env python3
"""CLI for managing RPG quests and items content packs."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ID_REGEX = re.compile(r"^[a-z0-9_]+$")
QUEST_DIFFICULTIES = {"easy", "medium", "hard", "expert", "legendary"}
QUEST_REPEAT_KINDS = {"none", "daily", "weekly", "cooldown"}
QUEST_PROFESSIONS = {"miner", "lumber"}
QUEST_STEP_KINDS = {
    "gather_item",
    "process_item",
    "craft_recipe",
    "market_list_item",
    "market_buy_item",
    "fight_win",
}
MARKET_CATEGORIES = {"materials", "consumables", "components", "gear", "tools"}


class CliError(RuntimeError):
    """Tool-level error with user-focused messaging."""


def _configure_stdio_utf8() -> None:
    """Ensure emoji-containing JSON can be printed on Windows terminals."""
    stdout = getattr(sys, "stdout", None)
    stderr = getattr(sys, "stderr", None)
    if hasattr(stdout, "reconfigure"):
        stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    if hasattr(stderr, "reconfigure"):
        stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]


@dataclass(frozen=True)
class PackPaths:
    """Resolved content pack file paths."""

    pack_dir: Path
    quests: Path
    items: Path
    recipes: Path


def _resolve_pack_file(pack_dir: Path, basename: str) -> Path:
    for extension in (".json5", ".json"):
        candidate = pack_dir / f"{basename}{extension}"
        if candidate.exists():
            return candidate
    raise CliError(f"Missing content pack: {basename}.json5 or {basename}.json in {pack_dir}")


def resolve_pack_paths(pack_dir: Path) -> PackPaths:
    return PackPaths(
        pack_dir=pack_dir,
        quests=_resolve_pack_file(pack_dir, "rpg.quests"),
        items=_resolve_pack_file(pack_dir, "rpg.materials"),
        recipes=_resolve_pack_file(pack_dir, "rpg.recipes"),
    )


def _parse_json5_loose(content: str) -> Any:
    without_block_comments = re.sub(r"/\*[\s\S]*?\*/", "", content)
    without_line_comments = re.sub(r"^\s*//.*$", "", without_block_comments, flags=re.MULTILINE)
    without_trailing_commas = re.sub(r",\s*([}\]])", r"\1", without_line_comments)
    quoted_unquoted_keys = re.sub(
        r'([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:',
        r'\1"\2":',
        without_trailing_commas,
    )
    return json.loads(quoted_unquoted_keys)


def parse_content_file(path: Path) -> Any:
    raw = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return json.loads(raw)
    if path.suffix == ".json5":
        try:
            import json5  # type: ignore

            return json5.loads(raw)
        except ModuleNotFoundError:
            return _parse_json5_loose(raw)
        except Exception:
            return _parse_json5_loose(raw)
    raise CliError(f"Unsupported file extension: {path}")


def write_content_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    temp_path.write_text(serialized, encoding="utf-8")
    temp_path.replace(path)


def _as_int(value: Any, *, min_value: int | None = None) -> bool:
    if not isinstance(value, int):
        return False
    if min_value is not None and value < min_value:
        return False
    return True


def _validate_id(value: Any) -> bool:
    return isinstance(value, str) and bool(ID_REGEX.fullmatch(value))


def _validate_repeat(repeat: Any, path: str, issues: list[str]) -> None:
    if not isinstance(repeat, dict):
        issues.append(f"{path}: repeat must be an object")
        return
    kind = repeat.get("kind")
    if kind not in QUEST_REPEAT_KINDS:
        issues.append(f"{path}.kind: invalid repeat kind '{kind}'")
        return
    if kind == "cooldown" and not _as_int(repeat.get("hours"), min_value=1):
        issues.append(f"{path}.hours: cooldown repeat requires integer hours >= 1")


def _validate_prerequisites(prerequisites: Any, path: str, issues: list[str], known_quest_ids: set[str]) -> None:
    if not isinstance(prerequisites, dict):
        issues.append(f"{path}: prerequisites must be an object")
        return
    profession = prerequisites.get("profession")
    if profession is not None and profession not in QUEST_PROFESSIONS:
        issues.append(f"{path}.profession: invalid profession '{profession}'")
    min_level = prerequisites.get("minLevel")
    if min_level is not None and not _as_int(min_level, min_value=1):
        issues.append(f"{path}.minLevel: expected integer >= 1")
    requires = prerequisites.get("requiresQuestsCompleted", [])
    if not isinstance(requires, list):
        issues.append(f"{path}.requiresQuestsCompleted: expected an array")
        return
    for idx, required_id in enumerate(requires):
        req_path = f"{path}.requiresQuestsCompleted[{idx}]"
        if not _validate_id(required_id):
            issues.append(f"{req_path}: invalid quest id format")
        elif required_id not in known_quest_ids:
            issues.append(f"{req_path}: unknown quest '{required_id}'")


def _validate_rewards(rewards: Any, path: str, issues: list[str], item_ids: set[str]) -> None:
    if not isinstance(rewards, dict):
        issues.append(f"{path}: rewards must be an object")
        return

    has_any_reward = False

    xp = rewards.get("xp")
    if xp is not None:
        if not _as_int(xp, min_value=0):
            issues.append(f"{path}.xp: expected integer >= 0")
        elif xp > 0:
            has_any_reward = True

    tokens = rewards.get("tokens")
    if tokens is not None:
        if not _as_int(tokens, min_value=0):
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
            if not _validate_id(reward.get("id")):
                issues.append(f"{reward_path}.id: invalid currency id")
            if not _as_int(reward.get("amount"), min_value=1):
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
            if not _validate_id(item_id):
                issues.append(f"{reward_path}.itemId: invalid item id")
            elif item_id not in item_ids:
                issues.append(f"{reward_path}.itemId: unknown item '{item_id}'")
            if not _as_int(reward.get("qty"), min_value=1):
                issues.append(f"{reward_path}.qty: expected integer >= 1")

    if not has_any_reward:
        issues.append(f"{path}: must contain at least one non-zero reward")


def _validate_step(step: Any, path: str, issues: list[str], item_ids: set[str], recipe_ids: set[str]) -> None:
    if not isinstance(step, dict):
        issues.append(f"{path}: step must be an object")
        return

    kind = step.get("kind")
    if kind not in QUEST_STEP_KINDS:
        issues.append(f"{path}.kind: invalid step kind '{kind}'")
        return

    if not _as_int(step.get("qty"), min_value=1):
        issues.append(f"{path}.qty: expected integer >= 1")

    if kind == "gather_item":
        if step.get("action") not in {"mine", "forest"}:
            issues.append(f"{path}.action: expected 'mine' or 'forest'")
        item_id = step.get("itemId")
        if not _validate_id(item_id):
            issues.append(f"{path}.itemId: invalid item id")
        elif item_id not in item_ids:
            issues.append(f"{path}.itemId: unknown item '{item_id}'")

        for key in ("locationTierMin", "locationTierMax", "toolTierMin"):
            value = step.get(key)
            if value is not None and (not _as_int(value, min_value=1) or value > 4):
                issues.append(f"{path}.{key}: expected integer between 1 and 4")
        tier_min = step.get("locationTierMin")
        tier_max = step.get("locationTierMax")
        if isinstance(tier_min, int) and isinstance(tier_max, int) and tier_max < tier_min:
            issues.append(f"{path}.locationTierMax: must be >= locationTierMin")
        return

    if kind == "process_item":
        input_item = step.get("inputItemId")
        output_item = step.get("outputItemId")
        if not _validate_id(input_item):
            issues.append(f"{path}.inputItemId: invalid item id")
        elif input_item not in item_ids:
            issues.append(f"{path}.inputItemId: unknown item '{input_item}'")
        if output_item is not None:
            if not _validate_id(output_item):
                issues.append(f"{path}.outputItemId: invalid item id")
            elif output_item not in item_ids:
                issues.append(f"{path}.outputItemId: unknown item '{output_item}'")
        success_only = step.get("successOnly")
        if success_only is not None and not isinstance(success_only, bool):
            issues.append(f"{path}.successOnly: expected boolean")
        return

    if kind == "craft_recipe":
        recipe_id = step.get("recipeId")
        if not _validate_id(recipe_id):
            issues.append(f"{path}.recipeId: invalid recipe id")
        elif recipe_id not in recipe_ids:
            issues.append(f"{path}.recipeId: unknown recipe '{recipe_id}'")
        return

    if kind in {"market_list_item", "market_buy_item"}:
        item_id = step.get("itemId")
        if not _validate_id(item_id):
            issues.append(f"{path}.itemId: invalid item id")
        elif item_id not in item_ids:
            issues.append(f"{path}.itemId: unknown item '{item_id}'")
        return

    if kind == "fight_win":
        return


def validate_item_pack(items_pack: Any) -> list[str]:
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
        if not _validate_id(item_id):
            issues.append(f"{item_path}.id: invalid id, expected ^[a-z0-9_]+$")
            continue
        if item_id in seen_ids:
            issues.append(f"{item_path}.id: duplicate id '{item_id}'")
        seen_ids.add(item_id)

        if not isinstance(item.get("name"), str) or not item["name"].strip():
            issues.append(f"{item_path}.name: required non-empty string")
        if not isinstance(item.get("description"), str) or not item["description"].strip():
            issues.append(f"{item_path}.description: required non-empty string")
        if item.get("maxStack") is not None and not _as_int(item.get("maxStack"), min_value=1):
            issues.append(f"{item_path}.maxStack: expected integer >= 1")
        if item.get("value") is not None and (
            not isinstance(item.get("value"), (int, float)) or item.get("value") < 0
        ):
            issues.append(f"{item_path}.value: expected number >= 0")

        market = item.get("market")
        if market is not None:
            if not isinstance(market, dict):
                issues.append(f"{item_path}.market: expected object")
            else:
                if not isinstance(market.get("tradable"), bool):
                    issues.append(f"{item_path}.market.tradable: expected boolean")
                if market.get("category") not in MARKET_CATEGORIES:
                    issues.append(
                        f"{item_path}.market.category: expected one of {sorted(MARKET_CATEGORIES)}"
                    )
                min_price = market.get("minPrice")
                max_price = market.get("maxPrice")
                if min_price is not None and not _as_int(min_price, min_value=1):
                    issues.append(f"{item_path}.market.minPrice: expected integer >= 1")
                if max_price is not None and not _as_int(max_price, min_value=1):
                    issues.append(f"{item_path}.market.maxPrice: expected integer >= 1")
                if isinstance(min_price, int) and isinstance(max_price, int) and max_price < min_price:
                    issues.append(f"{item_path}.market.maxPrice: must be >= minPrice")

    return issues


def validate_recipe_pack(recipes_pack: Any) -> list[str]:
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
        if not _validate_id(recipe_id):
            issues.append(f"{recipe_path}.id: invalid id")
            continue
        if recipe_id in seen_ids:
            issues.append(f"{recipe_path}.id: duplicate id '{recipe_id}'")
        seen_ids.add(recipe_id)
    return issues


def validate_quest_pack(quests_pack: Any, item_ids: set[str], recipe_ids: set[str]) -> list[str]:
    issues: list[str] = []
    if not isinstance(quests_pack, dict):
        return ["$quests: root must be an object"]
    if quests_pack.get("schemaVersion") != 1:
        issues.append("$quests.schemaVersion: expected 1")
    quests = quests_pack.get("quests")
    if not isinstance(quests, list):
        issues.append("$quests.quests: expected an array")
        return issues

    quest_ids: set[str] = set()
    for idx, quest in enumerate(quests):
        quest_path = f"$quests.quests[{idx}]"
        if not isinstance(quest, dict):
            issues.append(f"{quest_path}: expected object")
            continue
        quest_id = quest.get("id")
        if not _validate_id(quest_id):
            issues.append(f"{quest_path}.id: invalid id, expected ^[a-z0-9_]+$")
        elif quest_id in quest_ids:
            issues.append(f"{quest_path}.id: duplicate id '{quest_id}'")
        else:
            quest_ids.add(quest_id)

    for idx, quest in enumerate(quests):
        if not isinstance(quest, dict):
            continue
        quest_path = f"$quests.quests[{idx}]"
        if not isinstance(quest.get("title"), str) or not quest["title"].strip():
            issues.append(f"{quest_path}.title: required non-empty string")
        if not isinstance(quest.get("description"), str) or not quest["description"].strip():
            issues.append(f"{quest_path}.description: required non-empty string")
        if quest.get("difficulty", "easy") not in QUEST_DIFFICULTIES:
            issues.append(f"{quest_path}.difficulty: invalid difficulty")
        enabled = quest.get("enabled")
        if enabled is not None and not isinstance(enabled, bool):
            issues.append(f"{quest_path}.enabled: expected boolean")

        repeat = quest.get("repeat", {"kind": "none"})
        _validate_repeat(repeat, f"{quest_path}.repeat", issues)

        prerequisites = quest.get("prerequisites")
        if prerequisites is not None:
            _validate_prerequisites(prerequisites, f"{quest_path}.prerequisites", issues, quest_ids)

        steps = quest.get("steps")
        if not isinstance(steps, list) or len(steps) == 0:
            issues.append(f"{quest_path}.steps: expected non-empty array")
        else:
            for step_idx, step in enumerate(steps):
                _validate_step(step, f"{quest_path}.steps[{step_idx}]", issues, item_ids, recipe_ids)

        _validate_rewards(quest.get("rewards"), f"{quest_path}.rewards", issues, item_ids)

    return issues


def validate_packs(quests_pack: Any, items_pack: Any, recipes_pack: Any) -> list[str]:
    issues: list[str] = []
    item_issues = validate_item_pack(items_pack)
    recipe_issues = validate_recipe_pack(recipes_pack)
    issues.extend(item_issues)
    issues.extend(recipe_issues)

    item_ids: set[str] = set()
    if isinstance(items_pack, dict) and isinstance(items_pack.get("items"), list):
        for item in items_pack["items"]:
            if isinstance(item, dict) and _validate_id(item.get("id")):
                item_ids.add(item["id"])

    recipe_ids: set[str] = set()
    if isinstance(recipes_pack, dict) and isinstance(recipes_pack.get("recipes"), list):
        for recipe in recipes_pack["recipes"]:
            if isinstance(recipe, dict) and _validate_id(recipe.get("id")):
                recipe_ids.add(recipe["id"])

    issues.extend(validate_quest_pack(quests_pack, item_ids, recipe_ids))
    return issues


def load_all(paths: PackPaths) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    quests_pack = parse_content_file(paths.quests)
    items_pack = parse_content_file(paths.items)
    recipes_pack = parse_content_file(paths.recipes)
    if not isinstance(quests_pack, dict):
        raise CliError(f"{paths.quests} root must be an object")
    if not isinstance(items_pack, dict):
        raise CliError(f"{paths.items} root must be an object")
    if not isinstance(recipes_pack, dict):
        raise CliError(f"{paths.recipes} root must be an object")
    return quests_pack, items_pack, recipes_pack


def parse_path_tokens(path: str) -> list[str | int]:
    if not path.strip():
        raise CliError("Path cannot be empty")
    tokens: list[str | int] = []
    key_buffer = ""
    index = 0
    while index < len(path):
        char = path[index]
        if char == ".":
            if key_buffer:
                tokens.append(key_buffer)
                key_buffer = ""
            index += 1
            continue
        if char == "[":
            if key_buffer:
                tokens.append(key_buffer)
                key_buffer = ""
            closing = path.find("]", index)
            if closing == -1:
                raise CliError(f"Invalid path '{path}': missing closing ']'")
            raw_index = path[index + 1 : closing]
            if not raw_index.isdigit():
                raise CliError(f"Invalid path '{path}': index '{raw_index}' is not numeric")
            tokens.append(int(raw_index))
            index = closing + 1
            continue
        key_buffer += char
        index += 1
    if key_buffer:
        tokens.append(key_buffer)
    if not tokens:
        raise CliError("Path cannot be empty")
    return tokens


def _ensure_container(target: Any, token: str | int, next_token: str | int) -> Any:
    if isinstance(token, str):
        if not isinstance(target, dict):
            raise CliError(f"Cannot access key '{token}' on non-object")
        if token not in target or target[token] is None:
            target[token] = [] if isinstance(next_token, int) else {}
        return target[token]
    if not isinstance(target, list):
        raise CliError(f"Cannot access index [{token}] on non-array")
    if token < 0 or token >= len(target):
        raise CliError(f"Index [{token}] out of bounds (size={len(target)})")
    return target[token]


def set_by_path(target: Any, path: str, value: Any) -> None:
    tokens = parse_path_tokens(path)
    cursor = target
    for index, token in enumerate(tokens[:-1]):
        cursor = _ensure_container(cursor, token, tokens[index + 1])

    leaf = tokens[-1]
    if isinstance(leaf, str):
        if not isinstance(cursor, dict):
            raise CliError(f"Cannot set key '{leaf}' on non-object")
        cursor[leaf] = value
        return

    if not isinstance(cursor, list):
        raise CliError(f"Cannot set index [{leaf}] on non-array")
    if leaf < 0 or leaf >= len(cursor):
        raise CliError(f"Index [{leaf}] out of bounds (size={len(cursor)})")
    cursor[leaf] = value


def delete_by_path(target: Any, path: str) -> None:
    tokens = parse_path_tokens(path)
    cursor = target
    for index, token in enumerate(tokens[:-1]):
        cursor = _ensure_container(cursor, token, tokens[index + 1])

    leaf = tokens[-1]
    if isinstance(leaf, str):
        if not isinstance(cursor, dict):
            raise CliError(f"Cannot delete key '{leaf}' on non-object")
        if leaf not in cursor:
            raise CliError(f"Key '{leaf}' does not exist")
        del cursor[leaf]
        return

    if not isinstance(cursor, list):
        raise CliError(f"Cannot delete index [{leaf}] on non-array")
    if leaf < 0 or leaf >= len(cursor):
        raise CliError(f"Index [{leaf}] out of bounds (size={len(cursor)})")
    cursor.pop(leaf)


def parse_cli_value(raw: str) -> Any:
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
            raise CliError(f"Invalid JSON value: {exc}") from exc
    return raw


def find_entry(entries: list[dict[str, Any]], entry_id: str, label: str) -> tuple[int, dict[str, Any]]:
    for index, entry in enumerate(entries):
        if entry.get("id") == entry_id:
            return index, entry
    raise CliError(f"{label} '{entry_id}' not found")


def _save_if_valid(
    paths: PackPaths,
    quests_pack: dict[str, Any],
    items_pack: dict[str, Any],
    recipes_pack: dict[str, Any],
    *,
    write_quests: bool = False,
    write_items: bool = False,
) -> None:
    issues = validate_packs(quests_pack, items_pack, recipes_pack)
    if issues:
        joined = "\n".join(f" - {issue}" for issue in issues[:30])
        extra = "" if len(issues) <= 30 else f"\n - ... and {len(issues) - 30} more"
        raise CliError(f"Validation failed:\n{joined}{extra}")

    if write_quests:
        write_content_file(paths.quests, quests_pack)
    if write_items:
        write_content_file(paths.items, items_pack)


def cmd_validate(paths: PackPaths, _: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    issues = validate_packs(quests_pack, items_pack, recipes_pack)
    if issues:
        print("Validation failed:")
        for issue in issues:
            print(f" - {issue}")
        return 1
    quest_count = len(quests_pack.get("quests", []))
    item_count = len(items_pack.get("items", []))
    recipe_count = len(recipes_pack.get("recipes", []))
    print(f"OK: {quest_count} quests, {item_count} items, {recipe_count} recipes")
    return 0


def cmd_quests_list(paths: PackPaths, _: argparse.Namespace) -> int:
    quests_pack, _, _ = load_all(paths)
    quests = quests_pack.get("quests", [])
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
    quests_pack, _, _ = load_all(paths)
    quests = quests_pack.get("quests", [])
    if not isinstance(quests, list):
        raise CliError("Quest pack is invalid: quests must be an array")
    _, quest = find_entry([entry for entry in quests if isinstance(entry, dict)], args.quest_id, "Quest")
    print(json.dumps(quest, indent=2, ensure_ascii=False))
    return 0


def _default_gather_step(default_item_id: str) -> dict[str, Any]:
    return {
        "kind": "gather_item",
        "action": "mine",
        "itemId": default_item_id,
        "qty": 1,
        "locationTierMin": 1,
    }


def cmd_quests_create(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    quests = quests_pack.setdefault("quests", [])
    if not isinstance(quests, list):
        raise CliError("Quest pack is invalid: quests must be an array")
    if any(isinstance(entry, dict) and entry.get("id") == args.id for entry in quests):
        raise CliError(f"Quest '{args.id}' already exists")

    items = items_pack.get("items", [])
    default_item_id = "pyrite_ore"
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict) and _validate_id(item.get("id")):
                default_item_id = item["id"]
                break

    repeat: dict[str, Any] = {"kind": args.repeat_kind}
    if args.repeat_kind == "cooldown":
        repeat["hours"] = args.repeat_hours

    prerequisites: dict[str, Any] = {}
    if args.profession is not None:
        prerequisites["profession"] = args.profession
    if args.min_level is not None:
        prerequisites["minLevel"] = args.min_level
    if args.requires:
        prerequisites["requiresQuestsCompleted"] = [part.strip() for part in args.requires.split(",") if part.strip()]

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
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_quests=True)
    print(f"Created quest '{args.id}' in {paths.quests}")
    return 0


def cmd_quests_delete(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    quests = quests_pack.get("quests", [])
    if not isinstance(quests, list):
        raise CliError("Quest pack is invalid: quests must be an array")
    index, _ = find_entry([entry for entry in quests if isinstance(entry, dict)], args.quest_id, "Quest")
    quests.pop(index)
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_quests=True)
    print(f"Deleted quest '{args.quest_id}'")
    return 0


def cmd_quests_set(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    quests = quests_pack.get("quests", [])
    if not isinstance(quests, list):
        raise CliError("Quest pack is invalid: quests must be an array")
    _, quest = find_entry([entry for entry in quests if isinstance(entry, dict)], args.quest_id, "Quest")
    set_by_path(quest, args.path, parse_cli_value(args.value))
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_quests=True)
    print(f"Updated quest '{args.quest_id}' at path '{args.path}'")
    return 0


def cmd_quests_unset(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    quests = quests_pack.get("quests", [])
    if not isinstance(quests, list):
        raise CliError("Quest pack is invalid: quests must be an array")
    _, quest = find_entry([entry for entry in quests if isinstance(entry, dict)], args.quest_id, "Quest")
    delete_by_path(quest, args.path)
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_quests=True)
    print(f"Removed path '{args.path}' from quest '{args.quest_id}'")
    return 0


def _parse_param_pairs(raw_params: Iterable[str]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for raw_param in raw_params:
        if "=" not in raw_param:
            raise CliError(f"Invalid --param '{raw_param}'. Expected key=value")
        key, raw_value = raw_param.split("=", 1)
        key = key.strip()
        if not key:
            raise CliError(f"Invalid --param '{raw_param}'. Key cannot be empty")
        params[key] = parse_cli_value(raw_value)
    return params


def cmd_quests_step_add(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    quests = quests_pack.get("quests", [])
    if not isinstance(quests, list):
        raise CliError("Quest pack is invalid: quests must be an array")
    _, quest = find_entry([entry for entry in quests if isinstance(entry, dict)], args.quest_id, "Quest")
    steps = quest.setdefault("steps", [])
    if not isinstance(steps, list):
        raise CliError("Quest is invalid: steps must be an array")

    new_step: dict[str, Any] = {"kind": args.kind, "qty": args.qty}
    new_step.update(_parse_param_pairs(args.param))
    steps.append(new_step)
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_quests=True)
    print(f"Added step '{args.kind}' to quest '{args.quest_id}'")
    return 0


def cmd_quests_step_remove(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    quests = quests_pack.get("quests", [])
    if not isinstance(quests, list):
        raise CliError("Quest pack is invalid: quests must be an array")
    _, quest = find_entry([entry for entry in quests if isinstance(entry, dict)], args.quest_id, "Quest")
    steps = quest.get("steps")
    if not isinstance(steps, list):
        raise CliError("Quest is invalid: steps must be an array")
    if args.index < 0 or args.index >= len(steps):
        raise CliError(f"Step index {args.index} out of bounds (size={len(steps)})")
    steps.pop(args.index)
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_quests=True)
    print(f"Removed step index {args.index} from quest '{args.quest_id}'")
    return 0


def cmd_items_list(paths: PackPaths, _: argparse.Namespace) -> int:
    _, items_pack, _ = load_all(paths)
    items = items_pack.get("items", [])
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
    _, items_pack, _ = load_all(paths)
    items = items_pack.get("items", [])
    if not isinstance(items, list):
        raise CliError("Items pack is invalid: items must be an array")
    _, item = find_entry([entry for entry in items if isinstance(entry, dict)], args.item_id, "Item")
    print(json.dumps(item, indent=2, ensure_ascii=False))
    return 0


def cmd_items_create(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    items = items_pack.setdefault("items", [])
    if not isinstance(items, list):
        raise CliError("Items pack is invalid: items must be an array")
    if any(isinstance(entry, dict) and entry.get("id") == args.id for entry in items):
        raise CliError(f"Item '{args.id}' already exists")

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
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_items=True)
    print(f"Created item '{args.id}' in {paths.items}")
    return 0


def cmd_items_delete(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    items = items_pack.get("items", [])
    if not isinstance(items, list):
        raise CliError("Items pack is invalid: items must be an array")
    index, _ = find_entry([entry for entry in items if isinstance(entry, dict)], args.item_id, "Item")
    items.pop(index)
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_items=True)
    print(f"Deleted item '{args.item_id}'")
    return 0


def cmd_items_set(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    items = items_pack.get("items", [])
    if not isinstance(items, list):
        raise CliError("Items pack is invalid: items must be an array")
    _, item = find_entry([entry for entry in items if isinstance(entry, dict)], args.item_id, "Item")
    set_by_path(item, args.path, parse_cli_value(args.value))
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_items=True)
    print(f"Updated item '{args.item_id}' at path '{args.path}'")
    return 0


def cmd_items_unset(paths: PackPaths, args: argparse.Namespace) -> int:
    quests_pack, items_pack, recipes_pack = load_all(paths)
    items = items_pack.get("items", [])
    if not isinstance(items, list):
        raise CliError("Items pack is invalid: items must be an array")
    _, item = find_entry([entry for entry in items if isinstance(entry, dict)], args.item_id, "Item")
    delete_by_path(item, args.path)
    _save_if_valid(paths, quests_pack, items_pack, recipes_pack, write_items=True)
    print(f"Removed path '{args.path}' from item '{args.item_id}'")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage RPG quests and items content packs.")
    parser.add_argument(
        "--pack-dir",
        type=Path,
        default=Path("content/packs"),
        help="Directory containing content packs (default: content/packs).",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate quests/items/recipes packs.")
    validate_parser.set_defaults(handler=cmd_validate)

    quests_parser = subparsers.add_parser("quests", help="Quest operations.")
    quests_sub = quests_parser.add_subparsers(dest="quests_command", required=True)

    quests_list = quests_sub.add_parser("list", help="List quests.")
    quests_list.set_defaults(handler=cmd_quests_list)

    quests_show = quests_sub.add_parser("show", help="Show one quest as JSON.")
    quests_show.add_argument("quest_id")
    quests_show.set_defaults(handler=cmd_quests_show)

    quests_create = quests_sub.add_parser("create", help="Create a quest skeleton.")
    quests_create.add_argument("id")
    quests_create.add_argument("--title", required=True)
    quests_create.add_argument("--description", required=True)
    quests_create.add_argument("--icon", default="📜")
    quests_create.add_argument("--difficulty", choices=sorted(QUEST_DIFFICULTIES), default="easy")
    quests_create.add_argument("--repeat-kind", choices=sorted(QUEST_REPEAT_KINDS), default="none")
    quests_create.add_argument("--repeat-hours", type=int, default=24)
    quests_create.add_argument("--profession", choices=sorted(QUEST_PROFESSIONS))
    quests_create.add_argument("--min-level", type=int)
    quests_create.add_argument(
        "--requires",
        help="Comma-separated required quest IDs (maps to prerequisites.requiresQuestsCompleted).",
    )
    quests_create.add_argument("--coins", type=int, default=100)
    quests_create.add_argument("--xp", type=int, default=50)
    quests_create.add_argument("--disabled", action="store_true")
    quests_create.set_defaults(handler=cmd_quests_create)

    quests_delete = quests_sub.add_parser("delete", help="Delete a quest.")
    quests_delete.add_argument("quest_id")
    quests_delete.set_defaults(handler=cmd_quests_delete)

    quests_set = quests_sub.add_parser(
        "set", help="Set a quest field using JSON path (ex: steps[0].itemId)."
    )
    quests_set.add_argument("quest_id")
    quests_set.add_argument("--path", required=True)
    quests_set.add_argument("--value", required=True)
    quests_set.set_defaults(handler=cmd_quests_set)

    quests_unset = quests_sub.add_parser(
        "unset", help="Delete a quest field using JSON path (ex: prerequisites.profession)."
    )
    quests_unset.add_argument("quest_id")
    quests_unset.add_argument("--path", required=True)
    quests_unset.set_defaults(handler=cmd_quests_unset)

    quests_step_add = quests_sub.add_parser("step-add", help="Append a quest step.")
    quests_step_add.add_argument("quest_id")
    quests_step_add.add_argument("--kind", choices=sorted(QUEST_STEP_KINDS), required=True)
    quests_step_add.add_argument("--qty", type=int, default=1)
    quests_step_add.add_argument(
        "--param",
        action="append",
        default=[],
        help="Additional step fields as key=value. Repeat flag as needed.",
    )
    quests_step_add.set_defaults(handler=cmd_quests_step_add)

    quests_step_remove = quests_sub.add_parser("step-remove", help="Remove step by index.")
    quests_step_remove.add_argument("quest_id")
    quests_step_remove.add_argument("--index", type=int, required=True)
    quests_step_remove.set_defaults(handler=cmd_quests_step_remove)

    items_parser = subparsers.add_parser("items", help="Item operations.")
    items_sub = items_parser.add_subparsers(dest="items_command", required=True)

    items_list = items_sub.add_parser("list", help="List items.")
    items_list.set_defaults(handler=cmd_items_list)

    items_show = items_sub.add_parser("show", help="Show one item as JSON.")
    items_show.add_argument("item_id")
    items_show.set_defaults(handler=cmd_items_show)

    items_create = items_sub.add_parser("create", help="Create an item.")
    items_create.add_argument("id")
    items_create.add_argument("--name", required=True)
    items_create.add_argument("--description", required=True)
    items_create.add_argument("--emoji", default=":package:")
    items_create.add_argument("--max-stack", type=int, default=99)
    items_create.add_argument("--weight", type=float, default=1)
    items_create.add_argument("--can-stack", action=argparse.BooleanOptionalAction, default=True)
    items_create.add_argument("--value", type=int, default=1)
    items_create.add_argument("--tradable", action=argparse.BooleanOptionalAction, default=True)
    items_create.add_argument("--category", choices=sorted(MARKET_CATEGORIES), default="materials")
    items_create.add_argument("--suggested-price", type=int)
    items_create.add_argument("--min-price", type=int, default=1)
    items_create.add_argument("--max-price", type=int, default=5000)
    items_create.set_defaults(handler=cmd_items_create)

    items_delete = items_sub.add_parser("delete", help="Delete an item.")
    items_delete.add_argument("item_id")
    items_delete.set_defaults(handler=cmd_items_delete)

    items_set = items_sub.add_parser(
        "set", help="Set an item field using JSON path (ex: market.suggestedPrice)."
    )
    items_set.add_argument("item_id")
    items_set.add_argument("--path", required=True)
    items_set.add_argument("--value", required=True)
    items_set.set_defaults(handler=cmd_items_set)

    items_unset = items_sub.add_parser(
        "unset", help="Delete an item field using JSON path (ex: market.maxPrice)."
    )
    items_unset.add_argument("item_id")
    items_unset.add_argument("--path", required=True)
    items_unset.set_defaults(handler=cmd_items_unset)

    return parser


def main(argv: list[str] | None = None) -> int:
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
