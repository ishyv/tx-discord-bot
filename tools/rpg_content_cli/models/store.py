"""Domain model for RPG store items.

This module defines the StoreItem model for store catalog entries.
Store items reference existing items from the materials pack and add
store-specific properties like pricing, stock, and availability.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from rpg_content_cli.models.common import ContentId


@dataclass
class StoreItem:
    """Store catalog entry for an item.
    
    StoreItems reference an existing item from the materials pack and add
    store-specific properties for pricing, stock, and purchase restrictions.
    
    Invariants:
        - item_id references an existing item in the items pack
        - buy_price >= 1
        - sell_price >= 1
        - stock >= -1 (-1 means unlimited)
        - purchase_limit >= 0 (0 means unlimited)
    """
    item_id: ContentId
    name: str
    buy_price: int
    sell_price: int
    stock: int = -1  # -1 = unlimited
    available: bool = True
    description: str | None = None
    category: str | None = None
    purchase_limit: int = 0  # 0 = unlimited
    required_role: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoreItem":
        """Create StoreItem from a raw dictionary.
        
        Args:
            data: Dictionary with store item fields from content pack
            
        Returns:
            StoreItem instance
        """
        return cls(
            item_id=ContentId(str(data.get("itemId", ""))),
            name=str(data.get("name", "")),
            buy_price=int(data.get("buyPrice", 0)),
            sell_price=int(data.get("sellPrice", 0)),
            stock=int(data.get("stock", -1)),
            available=bool(data.get("available", True)),
            description=data.get("description"),
            category=data.get("category"),
            purchase_limit=int(data.get("purchaseLimit", 0)),
            required_role=data.get("requiredRole"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a dictionary for JSON serialization.
        
        Returns:
            Dictionary with camelCase keys matching pack schema
        """
        result: dict[str, Any] = {
            "itemId": self.item_id,
            "name": self.name,
            "buyPrice": self.buy_price,
            "sellPrice": self.sell_price,
            "stock": self.stock,
            "available": self.available,
        }
        if self.description is not None:
            result["description"] = self.description
        if self.category is not None:
            result["category"] = self.category
        if self.purchase_limit > 0:
            result["purchaseLimit"] = self.purchase_limit
        if self.required_role is not None:
            result["requiredRole"] = self.required_role
        return result


@dataclass
class StoreCatalog:
    """Store catalog containing available items.
    
    This is the root structure of the store content pack.
    
    Invariants:
        - schema_version is 1
        - items list contains valid StoreItem entries
    """
    schema_version: int = 1
    items: list[StoreItem] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StoreCatalog":
        """Create StoreCatalog from a raw dictionary."""
        items_data = data.get("items", [])
        items = []
        if isinstance(items_data, list):
            for item_data in items_data:
                if isinstance(item_data, dict):
                    items.append(StoreItem.from_dict(item_data))
        return cls(
            schema_version=int(data.get("schemaVersion", 1)),
            items=items,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a dictionary for JSON serialization."""
        return {
            "schemaVersion": self.schema_version,
            "items": [item.to_dict() for item in self.items],
        }
