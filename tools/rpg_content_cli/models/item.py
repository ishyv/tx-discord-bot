"""Domain models for RPG items.

This module defines the Item model and related types with strict typing.
Items can be either stackable (materials, consumables) or instance-based (gear, tools).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal

from rpg_content_cli.models.common import ContentId


class ItemKind(str, Enum):
    """Discriminator for item behavior type.
    
    - STACKABLE: Items that stack in inventory (materials, consumables)
    - INSTANCE: Items with individual identity (gear, tools with durability)
    """
    STACKABLE = "stackable"
    INSTANCE = "instance"


@dataclass
class MarketInfo:
    """Market trading configuration for an item.
    
    Invariants:
        - minPrice <= maxPrice when both are set
        - suggestedPrice is between minPrice and maxPrice when all are set
    """
    tradable: bool = True
    category: str = "materials"
    suggested_price: int | None = None
    min_price: int | None = None
    max_price: int | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MarketInfo":
        """Create MarketInfo from a raw dictionary.
        
        Args:
            data: Dictionary with market fields
            
        Returns:
            MarketInfo instance
        """
        return cls(
            tradable=bool(data.get("tradable", True)),
            category=str(data.get("category", "materials")),
            suggested_price=data.get("suggestedPrice"),
            min_price=data.get("minPrice"),
            max_price=data.get("maxPrice"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a dictionary for JSON serialization.
        
        Returns:
            Dictionary with camelCase keys matching pack schema
        """
        result: dict[str, Any] = {
            "tradable": self.tradable,
            "category": self.category,
        }
        if self.suggested_price is not None:
            result["suggestedPrice"] = self.suggested_price
        if self.min_price is not None:
            result["minPrice"] = self.min_price
        if self.max_price is not None:
            result["maxPrice"] = self.max_price
        return result


@dataclass
class Item:
    """RPG item definition.
    
    Items are static definitions loaded from content packs. They define
    the properties of items that can be held in player inventories.
    
    Invariants:
        - id matches ^[a-z0-9_]+$ pattern
        - name and description are non-empty strings
        - max_stack >= 1 for stackable items
        - value >= 0
        
    Discriminated by:
        - can_stack=True → stackable behavior (qty in inventory)
        - can_stack=False → instance behavior (individual items)
    """
    id: ContentId
    name: str
    description: str
    emoji: str = ":package:"
    max_stack: int = 99
    weight: float = 1.0
    can_stack: bool = True
    value: int = 0
    market: MarketInfo | None = None

    @property
    def kind(self) -> ItemKind:
        """Derived item kind based on stacking behavior."""
        return ItemKind.STACKABLE if self.can_stack else ItemKind.INSTANCE

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Item":
        """Create Item from a raw dictionary.
        
        Args:
            data: Dictionary with item fields from content pack
            
        Returns:
            Item instance
            
        Note:
            This does not validate the data; use validation layer for that.
        """
        market_data = data.get("market")
        market = MarketInfo.from_dict(market_data) if isinstance(market_data, dict) else None
        
        return cls(
            id=ContentId(str(data.get("id", ""))),
            name=str(data.get("name", "")),
            description=str(data.get("description", "")),
            emoji=str(data.get("emoji", ":package:")),
            max_stack=int(data.get("maxStack", 99)),
            weight=float(data.get("weight", 1.0)),
            can_stack=bool(data.get("canStack", True)),
            value=int(data.get("value", 0)),
            market=market,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a dictionary for JSON serialization.
        
        Returns:
            Dictionary with camelCase keys matching pack schema
        """
        result: dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "emoji": self.emoji,
            "maxStack": self.max_stack,
            "weight": self.weight,
            "canStack": self.can_stack,
            "value": self.value,
        }
        if self.market is not None:
            result["market"] = self.market.to_dict()
        return result
