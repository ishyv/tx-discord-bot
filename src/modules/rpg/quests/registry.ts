import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSON5 from "json5";
import type { z } from "zod";
import {
  DEFAULT_CONTENT_PACKS_DIR,
  loadContentRegistry,
  type ContentRegistry,
} from "@/modules/content";
import {
  QuestPackSchema,
  QuestlinePackSchema,
  type ParsedQuestlineDef,
} from "./schema";
import type { QuestDef, QuestlineDef } from "./types";

const QUEST_PACK_BASENAME = "rpg.quests";
const QUESTLINE_PACK_BASENAME = "rpg.questlines";

export interface SourceMeta {
  readonly file: string;
  readonly jsonPath: string;
}

export type Sourced<T> = T & { readonly __source: SourceMeta };

export interface LoadedQuestPacks {
  readonly packDir: string;
  readonly quests: readonly Sourced<QuestDef>[];
  readonly questlines: readonly Sourced<QuestlineDef>[];
}

export class QuestLoadError extends Error {
  constructor(
    message: string,
    public readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "QuestLoadError";
  }
}

function formatZodIssues(issues: readonly z.ZodIssue[], file: string): string[] {
  return issues.map((issue) => {
    const jsonPath = issue.path.length
      ? `$.${issue.path
          .map((part) => (typeof part === "number" ? `[${part}]` : String(part)))
          .join(".")
          .replace(".[", "[")}`
      : "$";
    return `${file} ${jsonPath}: ${issue.message}`;
  });
}

function parseJson5Loose(content: string): unknown {
  const withoutBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, "");
  const withoutTrailingCommas = withoutLineComments.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas);
}

function parseContentFile(rawContent: string, filePath: string): unknown {
  if (filePath.endsWith(".json")) {
    return JSON.parse(rawContent);
  }

  if (filePath.endsWith(".json5")) {
    try {
      return JSON5.parse(rawContent);
    } catch {
      return parseJson5Loose(rawContent);
    }
  }

  throw new QuestLoadError(`Unsupported quest file extension: ${filePath}`);
}

function resolveRequiredPack(packDir: string, baseName: string): string {
  const json5Path = path.join(packDir, `${baseName}.json5`);
  if (existsSync(json5Path)) {
    return json5Path;
  }

  const jsonPath = path.join(packDir, `${baseName}.json`);
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  throw new QuestLoadError(
    `Missing required quest pack: ${baseName}.json or ${baseName}.json5`,
    [path.join(packDir, baseName)],
  );
}

function resolveOptionalPack(packDir: string, baseName: string): string | null {
  const json5Path = path.join(packDir, `${baseName}.json5`);
  if (existsSync(json5Path)) {
    return json5Path;
  }

  const jsonPath = path.join(packDir, `${baseName}.json`);
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  return null;
}

function sourceJoin(basePath: string, index: number): string {
  return `${basePath}[${index}]`;
}

export async function loadQuestPacks(
  packDir: string = DEFAULT_CONTENT_PACKS_DIR,
): Promise<LoadedQuestPacks> {
  const questsFile = resolveRequiredPack(packDir, QUEST_PACK_BASENAME);
  const questlineFile = resolveOptionalPack(packDir, QUESTLINE_PACK_BASENAME);

  const questsRawContent = await readFile(questsFile, "utf8");
  const questsRaw = parseContentFile(questsRawContent, questsFile);
  const parsedQuests = QuestPackSchema.safeParse(questsRaw);

  if (!parsedQuests.success) {
    throw new QuestLoadError(
      "Invalid quest content pack",
      formatZodIssues(parsedQuests.error.issues, questsFile),
    );
  }

  let parsedQuestlines: ParsedQuestlineDef[] = [];
  if (questlineFile) {
    const questlineRawContent = await readFile(questlineFile, "utf8");
    const questlineRaw = parseContentFile(questlineRawContent, questlineFile);
    const parsed = QuestlinePackSchema.safeParse(questlineRaw);

    if (!parsed.success) {
      throw new QuestLoadError(
        "Invalid questline content pack",
        formatZodIssues(parsed.error.issues, questlineFile),
      );
    }

    parsedQuestlines = parsed.data.questlines;
  }

  const sourcedQuests = parsedQuests.data.quests.map((quest, index) => ({
    ...(quest as QuestDef),
    __source: {
      file: questsFile,
      jsonPath: sourceJoin("$.quests", index),
    },
  }));

  const sourcedQuestlines = parsedQuestlines.map((questline, index) => ({
    ...(questline as QuestlineDef),
    __source: {
      file: questlineFile as string,
      jsonPath: sourceJoin("$.questlines", index),
    },
  }));

  return {
    packDir,
    quests: sourcedQuests,
    questlines: sourcedQuestlines,
  };
}

export class QuestValidationError extends Error {
  constructor(
    message: string,
    public readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "QuestValidationError";
  }
}

function validateQuestIds(loaded: LoadedQuestPacks): void {
  const seen = new Set<string>();
  const issues: string[] = [];

  for (const quest of loaded.quests) {
    if (seen.has(quest.id)) {
      issues.push(`${quest.__source.file} ${quest.__source.jsonPath}.id: duplicate quest id '${quest.id}'`);
      continue;
    }
    seen.add(quest.id);
  }

  if (issues.length > 0) {
    throw new QuestValidationError("Duplicate quest IDs detected", issues);
  }
}

function validateQuestRefs(loaded: LoadedQuestPacks): void {
  const issues: string[] = [];
  const questIds = new Set(loaded.quests.map((quest) => quest.id));

  for (const quest of loaded.quests) {
    const prereqs = quest.prerequisites?.requiresQuestsCompleted ?? [];
    prereqs.forEach((requiredId, idx) => {
      if (!questIds.has(requiredId)) {
        issues.push(
          `${quest.__source.file} ${quest.__source.jsonPath}.prerequisites.requiresQuestsCompleted[${idx}]: unknown quest '${requiredId}'`,
        );
      }
    });
  }

  for (const questline of loaded.questlines) {
    questline.questIds.forEach((questId, idx) => {
      if (!questIds.has(questId)) {
        issues.push(
          `${questline.__source.file} ${questline.__source.jsonPath}.questIds[${idx}]: unknown quest '${questId}'`,
        );
      }
    });
  }

  if (issues.length > 0) {
    throw new QuestValidationError("Quest reference validation failed", issues);
  }
}

function validateQuestContentRefs(
  loaded: LoadedQuestPacks,
  contentRegistry: ContentRegistry,
): void {
  const issues: string[] = [];
  const knownItems = new Set(contentRegistry.listItems().map((item) => item.id));
  const knownRecipes = new Set(contentRegistry.listRecipes().map((recipe) => recipe.id));

  for (const quest of loaded.quests) {
    quest.steps.forEach((step, stepIdx) => {
      const stepPath = `${quest.__source.file} ${quest.__source.jsonPath}.steps[${stepIdx}]`;

      switch (step.kind) {
        case "gather_item":
          if (!knownItems.has(step.itemId)) {
            issues.push(`${stepPath}.itemId: unknown item '${step.itemId}'`);
          }
          break;
        case "process_item":
          if (!knownItems.has(step.inputItemId)) {
            issues.push(`${stepPath}.inputItemId: unknown item '${step.inputItemId}'`);
          }
          if (step.outputItemId && !knownItems.has(step.outputItemId)) {
            issues.push(`${stepPath}.outputItemId: unknown item '${step.outputItemId}'`);
          }
          break;
        case "craft_recipe":
          if (!knownRecipes.has(step.recipeId)) {
            issues.push(`${stepPath}.recipeId: unknown recipe '${step.recipeId}'`);
          }
          break;
        case "market_list_item":
        case "market_buy_item":
          if (!knownItems.has(step.itemId)) {
            issues.push(`${stepPath}.itemId: unknown item '${step.itemId}'`);
          }
          break;
        case "fight_win":
          break;
      }
    });

    quest.rewards.items?.forEach((itemReward, rewardIdx) => {
      if (!knownItems.has(itemReward.itemId)) {
        issues.push(
          `${quest.__source.file} ${quest.__source.jsonPath}.rewards.items[${rewardIdx}].itemId: unknown item '${itemReward.itemId}'`,
        );
      }
    });
  }

  if (issues.length > 0) {
    throw new QuestValidationError("Quest content references are invalid", issues);
  }
}

export async function validateLoadedQuestPacks(
  loaded: LoadedQuestPacks,
  contentRegistry?: ContentRegistry,
): Promise<void> {
  const registry = contentRegistry ?? (await loadContentRegistry(loaded.packDir));

  validateQuestIds(loaded);
  validateQuestRefs(loaded);
  validateQuestContentRefs(loaded, registry);
}

export interface QuestRegistry {
  readonly loadedFrom: string;
  listQuests(options?: { enabledOnly?: boolean }): readonly QuestDef[];
  getQuest(id: string): QuestDef | null;
  listQuestlines(): readonly QuestlineDef[];
  getQuestline(id: string): QuestlineDef | null;
}

class RuntimeQuestRegistry implements QuestRegistry {
  readonly loadedFrom: string;
  private readonly questsById: Map<string, QuestDef>;
  private readonly questlinesById: Map<string, QuestlineDef>;

  constructor(loaded: LoadedQuestPacks) {
    this.loadedFrom = loaded.packDir;
    this.questsById = new Map(loaded.quests.map((quest) => [quest.id, quest]));
    this.questlinesById = new Map(
      loaded.questlines.map((questline) => [questline.id, questline]),
    );
  }

  listQuests(options?: { enabledOnly?: boolean }): readonly QuestDef[] {
    const values = Array.from(this.questsById.values());
    if (!options?.enabledOnly) {
      return values;
    }
    return values.filter((quest) => quest.enabled !== false);
  }

  getQuest(id: string): QuestDef | null {
    return this.questsById.get(id) ?? null;
  }

  listQuestlines(): readonly QuestlineDef[] {
    return Array.from(this.questlinesById.values());
  }

  getQuestline(id: string): QuestlineDef | null {
    return this.questlinesById.get(id) ?? null;
  }
}

let cachedRegistry: QuestRegistry | null = null;
let cachedDir: string | null = null;

export async function loadQuestRegistry(
  packDir: string = DEFAULT_CONTENT_PACKS_DIR,
  options?: { forceReload?: boolean },
): Promise<QuestRegistry> {
  if (!options?.forceReload && cachedRegistry && cachedDir === packDir) {
    return cachedRegistry;
  }

  const loaded = await loadQuestPacks(packDir);
  await validateLoadedQuestPacks(loaded);

  const registry = new RuntimeQuestRegistry(loaded);
  cachedRegistry = registry;
  cachedDir = packDir;
  return registry;
}

export async function loadQuestRegistryOrThrow(): Promise<QuestRegistry> {
  return loadQuestRegistry(DEFAULT_CONTENT_PACKS_DIR, { forceReload: true });
}

export function getQuestRegistry(): QuestRegistry | null {
  return cachedRegistry;
}

export function resetQuestRegistryForTests(): void {
  cachedRegistry = null;
  cachedDir = null;
}
