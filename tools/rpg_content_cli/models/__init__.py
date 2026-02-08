"""Domain models for RPG content.

This module exports all domain model types for use across the CLI:
- Quest and related types (steps, rewards, prerequisites)
- Item and market info
- Common types (ContentId)
"""

from rpg_content_cli.models.common import ContentId, validate_content_id
from rpg_content_cli.models.item import Item, ItemKind, MarketInfo
from rpg_content_cli.models.quest import (
    CraftRecipeStep,
    CurrencyReward,
    FightWinStep,
    GatherItemStep,
    ItemReward,
    MarketBuyItemStep,
    MarketListItemStep,
    Prerequisites,
    ProcessItemStep,
    Quest,
    QuestRepeat,
    QuestStep,
    Rewards,
)
from rpg_content_cli.models.store import StoreCatalog, StoreItem

__all__ = [
    # Common
    "ContentId",
    "validate_content_id",
    # Item
    "Item",
    "ItemKind",
    "MarketInfo",
    # Quest
    "Quest",
    "QuestRepeat",
    "Prerequisites",
    "Rewards",
    "CurrencyReward",
    "ItemReward",
    "QuestStep",
    "GatherItemStep",
    "ProcessItemStep",
    "CraftRecipeStep",
    "MarketListItemStep",
    "MarketBuyItemStep",
    "FightWinStep",
    # Store
    "StoreItem",
    "StoreCatalog",
]
