import { z } from "zod";

export const CONTENT_SCHEMA_VERSION = 1 as const;

/** Canonical content IDs (items, recipes, locations, drop tables). */
export const CONTENT_ID_REGEX = /^[a-z0-9_]+$/;

export const ContentIdSchema = z
  .string()
  .regex(
    CONTENT_ID_REGEX,
    "Invalid id. Expected pattern ^[a-z0-9_]+$",
  );

export const ProfessionSchema = z.enum(["miner", "lumber"]);
export type Profession = z.infer<typeof ProfessionSchema>;

export const GatherActionSchema = z.enum(["mine", "forest"]);
export type GatherAction = z.infer<typeof GatherActionSchema>;

export const ItemStatSchema = z
  .object({
    atk: z.number().int().optional(),
    def: z.number().int().optional(),
    hp: z.number().int().optional(),
  })
  .strict();

export const ToolKindSchema = z.enum(["pickaxe", "axe"]);

export const ToolMetadataSchema = z
  .object({
    toolKind: ToolKindSchema,
    tier: z.number().int().min(1).max(4),
    maxDurability: z.number().int().min(1),
  })
  .strict();

export const RpgSlotSchema = z.enum([
  "weapon",
  "shield",
  "helmet",
  "chest",
  "pants",
  "boots",
  "ring",
  "necklace",
  "tool",
]);

export const MarketCategorySchema = z.enum([
  "materials",
  "consumables",
  "components",
  "gear",
  "tools",
]);

export const MarketMetadataSchema = z
  .object({
    tradable: z.boolean(),
    category: MarketCategorySchema,
    suggestedPrice: z.number().int().min(1).optional(),
    minPrice: z.number().int().min(1).optional(),
    maxPrice: z.number().int().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.maxPrice < value.minPrice
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "market.maxPrice must be greater than or equal to market.minPrice",
      });
    }
  });

export const ItemDefSchema = z
  .object({
    id: ContentIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    emoji: z.string().optional(),
    maxStack: z.number().int().min(1).optional(),
    weight: z.number().min(0).optional(),
    canStack: z.boolean().optional(),
    value: z.number().min(0).optional(),
    rpgSlot: RpgSlotSchema.optional(),
    stats: ItemStatSchema.optional(),
    tool: ToolMetadataSchema.optional(),
    market: MarketMetadataSchema.optional(),
  })
  .strict();

export type ItemDef = z.infer<typeof ItemDefSchema>;
export type MarketCategory = z.infer<typeof MarketCategorySchema>;
export type MarketMetadata = z.infer<typeof MarketMetadataSchema>;

export const RecipeItemDefSchema = z
  .object({
    itemId: ContentIdSchema,
    quantity: z.number().int().min(1),
  })
  .strict();

export const RecipeCurrencyInputDefSchema = z
  .object({
    currencyId: ContentIdSchema,
    amount: z.number().int().min(1),
  })
  .strict();

export const RecipeGuildFeeDefSchema = z
  .object({
    currencyId: ContentIdSchema,
    amount: z.number().int().min(1),
    sector: z.enum(["global", "works", "trade", "tax"]),
  })
  .strict();

export const RecipeDefSchema = z
  .object({
    id: ContentIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    type: z.enum(["crafting", "processing"]).default("crafting"),
    itemInputs: z.array(RecipeItemDefSchema).min(1),
    currencyInput: RecipeCurrencyInputDefSchema.optional(),
    itemOutputs: z.array(RecipeItemDefSchema).min(1),
    guildFee: RecipeGuildFeeDefSchema.optional(),
    requiredLevel: z.number().int().min(1).optional(),
    professionRequirement: ProfessionSchema.optional(),
    tierRequirement: z.number().int().min(1).max(4).optional(),
    xpReward: z.number().int().min(0).default(0),
    enabled: z.boolean().default(true),
  })
  .strict();

export type RecipeDef = z.infer<typeof RecipeDefSchema>;

export const DropEntryDefSchema = z
  .object({
    itemId: ContentIdSchema,
    chance: z.number().min(0).max(1),
    weight: z.number().positive().default(1),
    minQty: z.number().int().min(1).default(1),
    maxQty: z.number().int().min(1).optional(),
    minToolTier: z.number().int().min(1).max(4).optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const maxQty = entry.maxQty ?? entry.minQty;
    if (maxQty < entry.minQty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxQty must be greater than or equal to minQty",
      });
    }
  });

export type DropEntryDef = z.infer<typeof DropEntryDefSchema>;

export const DropTableDefSchema = z
  .object({
    id: ContentIdSchema,
    action: GatherActionSchema,
    profession: ProfessionSchema.optional(),
    tier: z.number().int().min(1).max(4),
    locationId: ContentIdSchema.optional(),
    entries: z.array(DropEntryDefSchema).min(1),
  })
  .strict();

export type DropTableDef = z.infer<typeof DropTableDefSchema>;

export const LocationDefSchema = z
  .object({
    id: ContentIdSchema,
    name: z.string().min(1),
    action: GatherActionSchema,
    profession: ProfessionSchema,
    requiredTier: z.number().int().min(1).max(4),
    dropTableId: ContentIdSchema.optional(),
    materials: z.array(ContentIdSchema).default([]),
  })
  .strict();

export type LocationDef = z.infer<typeof LocationDefSchema>;

export const ItemPackSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    items: z.array(ItemDefSchema),
  })
  .strict();

export const RecipePackSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    recipes: z.array(RecipeDefSchema),
  })
  .strict();

export const DropTablePackSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    dropTables: z.array(DropTableDefSchema),
  })
  .strict();

export const LocationPackSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    locations: z.array(LocationDefSchema),
  })
  .strict();

export type ItemPack = z.infer<typeof ItemPackSchema>;
export type RecipePack = z.infer<typeof RecipePackSchema>;
export type DropTablePack = z.infer<typeof DropTablePackSchema>;
export type LocationPack = z.infer<typeof LocationPackSchema>;
