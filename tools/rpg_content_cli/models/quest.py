"""Domain models for RPG quests.

This module defines Quest and related types with strict typing:
- QuestStep is a discriminated union based on the 'kind' field
- Each step kind has its own dataclass with required fields
- Adding a new step kind requires adding a new dataclass here

All models support round-trip serialization (from_dict/to_dict).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Union

from rpg_content_cli.models.common import ContentId


# -----------------------------------------------------------------------------
# Quest Repeat Configuration
# -----------------------------------------------------------------------------

@dataclass
class QuestRepeat:
    """Quest repeatability configuration.
    
    Invariants:
        - kind is one of: "none", "daily", "weekly", "cooldown"
        - hours is required and >= 1 when kind is "cooldown"
    """
    kind: Literal["none", "daily", "weekly", "cooldown"] = "none"
    hours: int | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "QuestRepeat":
        """Create QuestRepeat from a raw dictionary."""
        return cls(
            kind=data.get("kind", "none"),
            hours=data.get("hours"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a dictionary for JSON serialization."""
        result: dict[str, Any] = {"kind": self.kind}
        if self.hours is not None:
            result["hours"] = self.hours
        return result


# -----------------------------------------------------------------------------
# Quest Prerequisites
# -----------------------------------------------------------------------------

@dataclass
class Prerequisites:
    """Quest prerequisites determining availability.
    
    Invariants:
        - profession, if set, is one of defined professions
        - min_level, if set, is >= 1
        - requires_quests_completed references existing quest IDs
    """
    profession: str | None = None
    min_level: int | None = None
    requires_quests_completed: list[ContentId] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Prerequisites":
        """Create Prerequisites from a raw dictionary."""
        requires = data.get("requiresQuestsCompleted", [])
        return cls(
            profession=data.get("profession"),
            min_level=data.get("minLevel"),
            requires_quests_completed=[ContentId(str(r)) for r in requires] if isinstance(requires, list) else [],
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a dictionary for JSON serialization."""
        result: dict[str, Any] = {}
        if self.profession is not None:
            result["profession"] = self.profession
        if self.min_level is not None:
            result["minLevel"] = self.min_level
        if self.requires_quests_completed:
            result["requiresQuestsCompleted"] = list(self.requires_quests_completed)
        return result


# -----------------------------------------------------------------------------
# Quest Rewards
# -----------------------------------------------------------------------------

@dataclass
class CurrencyReward:
    """Currency reward entry.
    
    Invariants:
        - id is a valid currency identifier
        - amount >= 1
    """
    id: str
    amount: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CurrencyReward":
        return cls(
            id=str(data.get("id", "")),
            amount=int(data.get("amount", 0)),
        )

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "amount": self.amount}


@dataclass
class ItemReward:
    """Item reward entry.
    
    Invariants:
        - item_id references an existing item
        - qty >= 1
    """
    item_id: ContentId
    qty: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ItemReward":
        return cls(
            item_id=ContentId(str(data.get("itemId", ""))),
            qty=int(data.get("qty", 1)),
        )

    def to_dict(self) -> dict[str, Any]:
        return {"itemId": self.item_id, "qty": self.qty}


@dataclass
class Rewards:
    """Quest completion rewards.
    
    Invariants:
        - At least one reward type must be non-zero/non-empty
    """
    xp: int = 0
    tokens: int = 0
    currency: list[CurrencyReward] = field(default_factory=list)
    items: list[ItemReward] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Rewards":
        currency_data = data.get("currency", [])
        items_data = data.get("items", [])
        return cls(
            xp=int(data.get("xp", 0)),
            tokens=int(data.get("tokens", 0)),
            currency=[CurrencyReward.from_dict(c) for c in currency_data] if isinstance(currency_data, list) else [],
            items=[ItemReward.from_dict(i) for i in items_data] if isinstance(items_data, list) else [],
        )

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if self.xp:
            result["xp"] = self.xp
        if self.tokens:
            result["tokens"] = self.tokens
        if self.currency:
            result["currency"] = [c.to_dict() for c in self.currency]
        if self.items:
            result["items"] = [i.to_dict() for i in self.items]
        return result


# -----------------------------------------------------------------------------
# Quest Steps (Discriminated Union)
# -----------------------------------------------------------------------------

@dataclass
class GatherItemStep:
    """Gather items from world action (mine/forest).
    
    Invariants:
        - action is "mine" or "forest"
        - item_id references an existing item
        - qty >= 1
        - location_tier_min/max are 1-4 when set
        - location_tier_max >= location_tier_min when both set
        - tool_tier_min is 1-4 when set
    """
    kind: Literal["gather_item"] = field(default="gather_item", init=False)
    action: Literal["mine", "forest"]
    item_id: ContentId
    qty: int
    location_tier_min: int | None = None
    location_tier_max: int | None = None
    tool_tier_min: int | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GatherItemStep":
        return cls(
            action=data.get("action", "mine"),
            item_id=ContentId(str(data.get("itemId", ""))),
            qty=int(data.get("qty", 1)),
            location_tier_min=data.get("locationTierMin"),
            location_tier_max=data.get("locationTierMax"),
            tool_tier_min=data.get("toolTierMin"),
        )

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "kind": "gather_item",
            "action": self.action,
            "itemId": self.item_id,
            "qty": self.qty,
        }
        if self.location_tier_min is not None:
            result["locationTierMin"] = self.location_tier_min
        if self.location_tier_max is not None:
            result["locationTierMax"] = self.location_tier_max
        if self.tool_tier_min is not None:
            result["toolTierMin"] = self.tool_tier_min
        return result


@dataclass
class ProcessItemStep:
    """Process an item (refining/smelting).
    
    Invariants:
        - input_item_id references an existing item
        - output_item_id, if set, references an existing item
        - qty >= 1
    """
    kind: Literal["process_item"] = field(default="process_item", init=False)
    input_item_id: ContentId
    qty: int
    output_item_id: ContentId | None = None
    success_only: bool | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProcessItemStep":
        output = data.get("outputItemId")
        return cls(
            input_item_id=ContentId(str(data.get("inputItemId", ""))),
            qty=int(data.get("qty", 1)),
            output_item_id=ContentId(str(output)) if output else None,
            success_only=data.get("successOnly"),
        )

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "kind": "process_item",
            "inputItemId": self.input_item_id,
            "qty": self.qty,
        }
        if self.output_item_id is not None:
            result["outputItemId"] = self.output_item_id
        if self.success_only is not None:
            result["successOnly"] = self.success_only
        return result


@dataclass
class CraftRecipeStep:
    """Craft items using a recipe.
    
    Invariants:
        - recipe_id references an existing recipe
        - qty >= 1
    """
    kind: Literal["craft_recipe"] = field(default="craft_recipe", init=False)
    recipe_id: ContentId
    qty: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CraftRecipeStep":
        return cls(
            recipe_id=ContentId(str(data.get("recipeId", ""))),
            qty=int(data.get("qty", 1)),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "craft_recipe",
            "recipeId": self.recipe_id,
            "qty": self.qty,
        }


@dataclass
class MarketListItemStep:
    """List an item on the market.
    
    Invariants:
        - item_id references an existing item
        - qty >= 1
    """
    kind: Literal["market_list_item"] = field(default="market_list_item", init=False)
    item_id: ContentId
    qty: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MarketListItemStep":
        return cls(
            item_id=ContentId(str(data.get("itemId", ""))),
            qty=int(data.get("qty", 1)),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "market_list_item",
            "itemId": self.item_id,
            "qty": self.qty,
        }


@dataclass
class MarketBuyItemStep:
    """Buy an item from the market.
    
    Invariants:
        - item_id references an existing item
        - qty >= 1
    """
    kind: Literal["market_buy_item"] = field(default="market_buy_item", init=False)
    item_id: ContentId
    qty: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MarketBuyItemStep":
        return cls(
            item_id=ContentId(str(data.get("itemId", ""))),
            qty=int(data.get("qty", 1)),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "market_buy_item",
            "itemId": self.item_id,
            "qty": self.qty,
        }


@dataclass
class FightWinStep:
    """Win combat encounters.
    
    Invariants:
        - qty >= 1
    """
    kind: Literal["fight_win"] = field(default="fight_win", init=False)
    qty: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FightWinStep":
        return cls(qty=int(data.get("qty", 1)))

    def to_dict(self) -> dict[str, Any]:
        return {"kind": "fight_win", "qty": self.qty}


# Discriminated union type for all step kinds
QuestStep = Union[
    GatherItemStep,
    ProcessItemStep, 
    CraftRecipeStep,
    MarketListItemStep,
    MarketBuyItemStep,
    FightWinStep,
]
"""Discriminated union of quest step types.

To add a new step kind:
1. Add the kind string to QUEST_STEP_KINDS in config.py
2. Create a new dataclass here with kind: Literal["new_kind"]
3. Add it to this union
4. Add parsing case in parse_step()
5. Add validation in validation/schemas.py
"""


def parse_step(data: dict[str, Any]) -> QuestStep | None:
    """Parse a step dictionary into the appropriate typed step.
    
    Args:
        data: Dictionary with step fields including 'kind'
        
    Returns:
        Typed step instance, or None if kind is unrecognized
    """
    kind = data.get("kind")
    if kind == "gather_item":
        return GatherItemStep.from_dict(data)
    if kind == "process_item":
        return ProcessItemStep.from_dict(data)
    if kind == "craft_recipe":
        return CraftRecipeStep.from_dict(data)
    if kind == "market_list_item":
        return MarketListItemStep.from_dict(data)
    if kind == "market_buy_item":
        return MarketBuyItemStep.from_dict(data)
    if kind == "fight_win":
        return FightWinStep.from_dict(data)
    return None


# -----------------------------------------------------------------------------
# Quest
# -----------------------------------------------------------------------------

@dataclass
class Quest:
    """RPG quest definition.
    
    Quests are static definitions loaded from content packs. They define
    objectives, prerequisites, and rewards for player progression.
    
    Invariants:
        - id matches ^[a-z0-9_]+$ pattern
        - title and description are non-empty strings
        - difficulty is one of defined difficulties
        - steps is non-empty
        - rewards contain at least one non-zero reward
    """
    id: ContentId
    title: str
    description: str
    icon: str = "📜"
    difficulty: str = "easy"
    enabled: bool = True
    repeat: QuestRepeat = field(default_factory=QuestRepeat)
    prerequisites: Prerequisites | None = None
    steps: list[QuestStep] = field(default_factory=list)
    rewards: Rewards = field(default_factory=Rewards)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Quest":
        """Create Quest from a raw dictionary.
        
        Args:
            data: Dictionary with quest fields from content pack
            
        Returns:
            Quest instance
            
        Note:
            This does not validate the data; use validation layer for that.
            Steps with unrecognized kinds are skipped.
        """
        repeat_data = data.get("repeat", {"kind": "none"})
        prereq_data = data.get("prerequisites")
        rewards_data = data.get("rewards", {})
        steps_data = data.get("steps", [])
        
        steps: list[QuestStep] = []
        if isinstance(steps_data, list):
            for step_data in steps_data:
                if isinstance(step_data, dict):
                    parsed = parse_step(step_data)
                    if parsed is not None:
                        steps.append(parsed)

        return cls(
            id=ContentId(str(data.get("id", ""))),
            title=str(data.get("title", "")),
            description=str(data.get("description", "")),
            icon=str(data.get("icon", "📜")),
            difficulty=str(data.get("difficulty", "easy")),
            enabled=bool(data.get("enabled", True)),
            repeat=QuestRepeat.from_dict(repeat_data) if isinstance(repeat_data, dict) else QuestRepeat(),
            prerequisites=Prerequisites.from_dict(prereq_data) if isinstance(prereq_data, dict) else None,
            steps=steps,
            rewards=Rewards.from_dict(rewards_data) if isinstance(rewards_data, dict) else Rewards(),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a dictionary for JSON serialization.
        
        Returns:
            Dictionary with camelCase keys matching pack schema
        """
        result: dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "icon": self.icon,
            "description": self.description,
            "repeat": self.repeat.to_dict(),
            "difficulty": self.difficulty,
            "enabled": self.enabled,
            "steps": [step.to_dict() for step in self.steps],
            "rewards": self.rewards.to_dict(),
        }
        if self.prerequisites is not None:
            prereq_dict = self.prerequisites.to_dict()
            if prereq_dict:  # Only include if non-empty
                result["prerequisites"] = prereq_dict
        return result
