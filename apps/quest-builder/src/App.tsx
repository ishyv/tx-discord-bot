import { useMemo, useState } from "react";
import JSON5 from "json5";
import contentRegistry from "../../../generated/content-registry.json";
import {
  QuestDefSchema,
  type ParsedQuestDef,
} from "@/modules/rpg/quests/schema";

type StepKind = ParsedQuestDef["steps"][number]["kind"];

type CompiledRegistry = {
  items: Array<{ id: string; name: string; category?: string }>;
  recipes: Array<{ id: string; name: string; type: "crafting" | "processing" }>;
};

const registry = contentRegistry as CompiledRegistry;

const STEP_KIND_OPTIONS: StepKind[] = [
  "gather_item",
  "process_item",
  "craft_recipe",
  "market_list_item",
  "market_buy_item",
  "fight_win",
];

function getStepTarget(step: ParsedQuestDef["steps"][number]): number {
  return step.qty;
}

function buildStepProgressText(
  step: ParsedQuestDef["steps"][number],
  current: number,
): string {
  const target = getStepTarget(step);
  const safeCurrent = Math.min(target, Math.max(0, current));

  switch (step.kind) {
    case "gather_item":
      return `Gather ${step.qty}x ${step.itemId} (${safeCurrent}/${target})`;
    case "process_item":
      return `Process ${step.qty}x ${step.inputItemId}${step.outputItemId ? ` -> ${step.outputItemId}` : ""} (${safeCurrent}/${target})`;
    case "craft_recipe":
      return `Craft ${step.qty}x ${step.recipeId} (${safeCurrent}/${target})`;
    case "market_list_item":
      return `List ${step.qty}x ${step.itemId} on market (${safeCurrent}/${target})`;
    case "market_buy_item":
      return `Buy ${step.qty}x ${step.itemId} from market (${safeCurrent}/${target})`;
    case "fight_win":
      return `Win ${step.qty} fight(s) (${safeCurrent}/${target})`;
    default:
      return `${safeCurrent}/${target}`;
  }
}

const DEFAULT_QUEST: ParsedQuestDef = {
  id: "new_quest",
  title: "New Quest",
  icon: "📌",
  description: "Describe the quest objective.",
  repeat: { kind: "none" },
  difficulty: "easy",
  prerequisites: {
    requiresQuestsCompleted: [],
  },
  steps: [
    {
      kind: "gather_item",
      action: "mine",
      itemId: registry.items[0]?.id ?? "pyrite_ore",
      qty: 10,
      locationTierMin: 1,
    },
  ],
  rewards: {
    currency: [{ id: "coins", amount: 100 }],
    xp: 50,
  },
  enabled: true,
};

function stepTemplate(kind: StepKind): ParsedQuestDef["steps"][number] {
  switch (kind) {
    case "gather_item":
      return {
        kind,
        action: "mine",
        itemId: registry.items[0]?.id ?? "pyrite_ore",
        qty: 10,
      };
    case "process_item":
      return {
        kind,
        inputItemId: registry.items[0]?.id ?? "pyrite_ore",
        outputItemId: registry.items[1]?.id,
        qty: 5,
        successOnly: true,
      };
    case "craft_recipe":
      return {
        kind,
        recipeId: registry.recipes[0]?.id ?? "process_pyrite_ore",
        qty: 1,
      };
    case "market_list_item":
      return {
        kind,
        itemId: registry.items[0]?.id ?? "pyrite_ore",
        qty: 5,
      };
    case "market_buy_item":
      return {
        kind,
        itemId: registry.items[0]?.id ?? "pyrite_ore",
        qty: 5,
      };
    case "fight_win":
      return {
        kind,
        qty: 1,
      };
    default:
      return {
        kind: "fight_win",
        qty: 1,
      };
  }
}

function parseQuestFromRaw(raw: string): ParsedQuestDef {
  const parsed = JSON5.parse(raw);
  return QuestDefSchema.parse(parsed);
}

function rewardSummary(quest: ParsedQuestDef): string {
  const parts: string[] = [];

  quest.rewards.currency?.forEach((reward) => {
    parts.push(`${reward.amount} ${reward.id}`);
  });

  quest.rewards.items?.forEach((reward) => {
    parts.push(`${reward.qty}x ${reward.itemId}`);
  });

  if ((quest.rewards.xp ?? 0) > 0) {
    parts.push(`${quest.rewards.xp} XP`);
  }

  if ((quest.rewards.tokens ?? 0) > 0) {
    parts.push(`${quest.rewards.tokens} tokens`);
  }

  return parts.length > 0 ? parts.join(" • ") : "No rewards";
}

function App() {
  const [quest, setQuest] = useState<ParsedQuestDef>(DEFAULT_QUEST);
  const [rawJson, setRawJson] = useState<string>(JSON5.stringify(DEFAULT_QUEST, null, 2));
  const [notice, setNotice] = useState<string>("Ready");

  const validation = useMemo(() => QuestDefSchema.safeParse(quest), [quest]);

  const questIdOptions = useMemo(() => {
    const ids = [quest.id, ...(quest.prerequisites?.requiresQuestsCompleted ?? [])];
    return Array.from(new Set(ids.filter((id) => id.length > 0))).sort();
  }, [quest]);

  const setField = <K extends keyof ParsedQuestDef>(field: K, value: ParsedQuestDef[K]) => {
    setQuest((previous) => ({ ...previous, [field]: value }));
  };

  const setStep = (
    index: number,
    updater: (step: ParsedQuestDef["steps"][number]) => ParsedQuestDef["steps"][number],
  ) => {
    setQuest((previous) => {
      const nextSteps = [...previous.steps];
      nextSteps[index] = updater(nextSteps[index]!);
      return { ...previous, steps: nextSteps };
    });
  };

  const deleteStep = (index: number) => {
    setQuest((previous) => {
      const nextSteps = previous.steps.filter((_, stepIndex) => stepIndex !== index);
      return {
        ...previous,
        steps: nextSteps.length > 0 ? nextSteps : [stepTemplate("fight_win")],
      };
    });
  };

  const addStep = (kind: StepKind) => {
    setQuest((previous) => ({
      ...previous,
      steps: [...previous.steps, stepTemplate(kind)],
    }));
  };

  const addCurrencyReward = () => {
    setQuest((previous) => ({
      ...previous,
      rewards: {
        ...previous.rewards,
        currency: [
          ...(previous.rewards.currency ?? []),
          { id: "coins", amount: 100 },
        ],
      },
    }));
  };

  const addItemReward = () => {
    setQuest((previous) => ({
      ...previous,
      rewards: {
        ...previous.rewards,
        items: [
          ...(previous.rewards.items ?? []),
          { itemId: registry.items[0]?.id ?? "pyrite_ore", qty: 1 },
        ],
      },
    }));
  };

  const exportJson5 = async () => {
    const output = JSON5.stringify(quest, null, 2);
    setRawJson(output);
    setNotice("Exported current quest to raw JSON5 panel.");

    try {
      await navigator.clipboard.writeText(output);
      setNotice("Exported and copied JSON5 to clipboard.");
    } catch {
      // Ignore clipboard errors (browser permissions).
    }
  };

  const importJson5 = () => {
    try {
      const parsed = parseQuestFromRaw(rawJson);
      setQuest(parsed);
      setNotice("Imported quest from raw JSON5.");
    } catch (error) {
      setNotice(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <main className="builder">
      <section className="hero">
        <p className="kicker">Quest Builder</p>
        <h1>Data-Driven RPG Quests</h1>
        <p className="subtitle">
          Uses the same Zod schema as the bot. Edit, validate, preview, and export JSON5 packs.
        </p>
        <div className="hero-actions">
          <button type="button" onClick={exportJson5}>
            Export JSON5
          </button>
          <button type="button" className="ghost" onClick={importJson5}>
            Import From Raw
          </button>
          <span className="status">{notice}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Quest Fields</h2>
        <div className="grid two">
          <label>
            ID
            <input
              value={quest.id}
              onChange={(event) => setField("id", event.target.value as ParsedQuestDef["id"])}
              placeholder="quest_id"
            />
          </label>
          <label>
            Title
            <input
              value={quest.title}
              onChange={(event) =>
                setField("title", event.target.value as ParsedQuestDef["title"])
              }
            />
          </label>
          <label>
            Icon
            <input
              value={quest.icon ?? ""}
              onChange={(event) => setField("icon", event.target.value || undefined)}
              placeholder="⛏️"
            />
          </label>
          <label>
            Difficulty
            <select
              value={quest.difficulty}
              onChange={(event) =>
                setField("difficulty", event.target.value as ParsedQuestDef["difficulty"])
              }
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
              <option value="expert">expert</option>
              <option value="legendary">legendary</option>
            </select>
          </label>
        </div>

        <label>
          Description
          <textarea
            value={quest.description}
            onChange={(event) =>
              setField("description", event.target.value as ParsedQuestDef["description"])
            }
            rows={3}
          />
        </label>

        <div className="grid two">
          <label>
            Repeat Kind
            <select
              value={quest.repeat.kind}
              onChange={(event) => {
                const kind = event.target.value as ParsedQuestDef["repeat"]["kind"];
                if (kind === "cooldown") {
                  setField("repeat", { kind: "cooldown", hours: 24 });
                } else {
                  setField("repeat", { kind });
                }
              }}
            >
              <option value="none">none</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="cooldown">cooldown</option>
            </select>
          </label>

          {quest.repeat.kind === "cooldown" ? (
            <label>
              Cooldown Hours
              <input
                type="number"
                min={1}
                value={quest.repeat.hours}
                onChange={(event) =>
                  setField("repeat", {
                    kind: "cooldown",
                    hours: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </label>
          ) : (
            <label>
              Enabled
              <select
                value={quest.enabled === false ? "false" : "true"}
                onChange={(event) =>
                  setField("enabled", event.target.value === "true")
                }
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          )}
        </div>

        <h3>Prerequisites</h3>
        <div className="grid three">
          <label>
            Profession
            <select
              value={quest.prerequisites?.profession ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value;
                setQuest((previous) => ({
                  ...previous,
                  prerequisites: {
                    ...(previous.prerequisites ?? { requiresQuestsCompleted: [] }),
                    profession: nextValue ? (nextValue as "miner" | "lumber") : undefined,
                  },
                }));
              }}
            >
              <option value="">(none)</option>
              <option value="miner">miner</option>
              <option value="lumber">lumber</option>
            </select>
          </label>
          <label>
            Min Level
            <input
              type="number"
              min={1}
              value={quest.prerequisites?.minLevel ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setQuest((previous) => ({
                  ...previous,
                  prerequisites: {
                    ...(previous.prerequisites ?? { requiresQuestsCompleted: [] }),
                    minLevel: value ? Math.max(1, Number(value)) : undefined,
                  },
                }));
              }}
            />
          </label>
          <label>
            Requires Quests (comma separated)
            <input
              list="quest-id-options"
              value={(quest.prerequisites?.requiresQuestsCompleted ?? []).join(",")}
              onChange={(event) => {
                const ids = event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter((value) => value.length > 0);

                setQuest((previous) => ({
                  ...previous,
                  prerequisites: {
                    ...(previous.prerequisites ?? {}),
                    requiresQuestsCompleted: ids,
                  },
                }));
              }}
            />
            <datalist id="quest-id-options">
              {questIdOptions.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Steps</h2>
          <div className="inline-actions">
            {STEP_KIND_OPTIONS.map((kind) => (
              <button key={kind} type="button" className="ghost" onClick={() => addStep(kind)}>
                + {kind}
              </button>
            ))}
          </div>
        </div>

        {quest.steps.map((step, index) => (
          <article key={`${step.kind}-${index}`} className="step-card">
            <header>
              <strong>Step {index + 1}</strong>
              <div className="inline-actions">
                <select
                  value={step.kind}
                  onChange={(event) => setStep(index, () => stepTemplate(event.target.value as StepKind))}
                >
                  {STEP_KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <button type="button" className="danger" onClick={() => deleteStep(index)}>
                  Remove
                </button>
              </div>
            </header>

            {step.kind === "gather_item" && (
              <div className="grid four">
                <label>
                  Action
                  <select
                    value={step.action}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        action: event.target.value as "mine" | "forest",
                      }))
                    }
                  >
                    <option value="mine">mine</option>
                    <option value="forest">forest</option>
                  </select>
                </label>
                <label>
                  Item
                  <select
                    value={step.itemId}
                    onChange={(event) =>
                      setStep(index, (previous) => ({ ...previous, itemId: event.target.value }))
                    }
                  >
                    {registry.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={step.qty}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        qty: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </label>
                <label>
                  Tier Min
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={step.locationTierMin ?? ""}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        locationTierMin: event.target.value
                          ? Math.max(1, Math.min(4, Number(event.target.value)))
                          : undefined,
                      }))
                    }
                  />
                </label>
              </div>
            )}

            {step.kind === "process_item" && (
              <div className="grid four">
                <label>
                  Input Item
                  <select
                    value={step.inputItemId}
                    onChange={(event) =>
                      setStep(index, (previous) => ({ ...previous, inputItemId: event.target.value }))
                    }
                  >
                    {registry.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Output Item
                  <select
                    value={step.outputItemId ?? ""}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        outputItemId: event.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">(any)</option>
                    {registry.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={step.qty}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        qty: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </label>
                <label>
                  Success Only
                  <select
                    value={step.successOnly === false ? "false" : "true"}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        successOnly: event.target.value === "true",
                      }))
                    }
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
              </div>
            )}

            {step.kind === "craft_recipe" && (
              <div className="grid two">
                <label>
                  Recipe
                  <select
                    value={step.recipeId}
                    onChange={(event) =>
                      setStep(index, (previous) => ({ ...previous, recipeId: event.target.value }))
                    }
                  >
                    {registry.recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={step.qty}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        qty: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </label>
              </div>
            )}

            {(step.kind === "market_list_item" || step.kind === "market_buy_item") && (
              <div className="grid two">
                <label>
                  Item
                  <select
                    value={step.itemId}
                    onChange={(event) =>
                      setStep(index, (previous) => ({ ...previous, itemId: event.target.value }))
                    }
                  >
                    {registry.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={step.qty}
                    onChange={(event) =>
                      setStep(index, (previous) => ({
                        ...previous,
                        qty: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </label>
              </div>
            )}

            {step.kind === "fight_win" && (
              <label>
                Wins Required
                <input
                  type="number"
                  min={1}
                  value={step.qty}
                  onChange={(event) =>
                    setStep(index, (previous) => ({
                      ...previous,
                      qty: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                />
              </label>
            )}
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Rewards</h2>
        <div className="grid two">
          <label>
            XP
            <input
              type="number"
              min={0}
              value={quest.rewards.xp ?? 0}
              onChange={(event) =>
                setQuest((previous) => ({
                  ...previous,
                  rewards: {
                    ...previous.rewards,
                    xp: Math.max(0, Number(event.target.value) || 0),
                  },
                }))
              }
            />
          </label>
          <label>
            Tokens
            <input
              type="number"
              min={0}
              value={quest.rewards.tokens ?? 0}
              onChange={(event) =>
                setQuest((previous) => ({
                  ...previous,
                  rewards: {
                    ...previous.rewards,
                    tokens: Math.max(0, Number(event.target.value) || 0),
                  },
                }))
              }
            />
          </label>
        </div>

        <h3>Currency Rewards</h3>
        {(quest.rewards.currency ?? []).map((reward, index) => (
          <div key={`currency-${index}`} className="grid three compact">
            <label>
              Currency
              <input
                value={reward.id}
                onChange={(event) =>
                  setQuest((previous) => ({
                    ...previous,
                    rewards: {
                      ...previous.rewards,
                      currency: (previous.rewards.currency ?? []).map((row, rowIdx) =>
                        rowIdx === index ? { ...row, id: event.target.value } : row,
                      ),
                    },
                  }))
                }
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                min={1}
                value={reward.amount}
                onChange={(event) =>
                  setQuest((previous) => ({
                    ...previous,
                    rewards: {
                      ...previous.rewards,
                      currency: (previous.rewards.currency ?? []).map((row, rowIdx) =>
                        rowIdx === index
                          ? { ...row, amount: Math.max(1, Number(event.target.value) || 1) }
                          : row,
                      ),
                    },
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setQuest((previous) => ({
                  ...previous,
                  rewards: {
                    ...previous.rewards,
                    currency: (previous.rewards.currency ?? []).filter(
                      (_reward, rewardIndex) => rewardIndex !== index,
                    ),
                  },
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="ghost" onClick={addCurrencyReward}>
          + Add Currency Reward
        </button>

        <h3>Item Rewards</h3>
        {(quest.rewards.items ?? []).map((reward, index) => (
          <div key={`item-${index}`} className="grid three compact">
            <label>
              Item
              <select
                value={reward.itemId}
                onChange={(event) =>
                  setQuest((previous) => ({
                    ...previous,
                    rewards: {
                      ...previous.rewards,
                      items: (previous.rewards.items ?? []).map((row, rowIdx) =>
                        rowIdx === index ? { ...row, itemId: event.target.value } : row,
                      ),
                    },
                  }))
                }
              >
                {registry.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Qty
              <input
                type="number"
                min={1}
                value={reward.qty}
                onChange={(event) =>
                  setQuest((previous) => ({
                    ...previous,
                    rewards: {
                      ...previous.rewards,
                      items: (previous.rewards.items ?? []).map((row, rowIdx) =>
                        rowIdx === index
                          ? { ...row, qty: Math.max(1, Number(event.target.value) || 1) }
                          : row,
                      ),
                    },
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="danger"
              onClick={() =>
                setQuest((previous) => ({
                  ...previous,
                  rewards: {
                    ...previous.rewards,
                    items: (previous.rewards.items ?? []).filter(
                      (_reward, rewardIndex) => rewardIndex !== index,
                    ),
                  },
                }))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="ghost" onClick={addItemReward}>
          + Add Item Reward
        </button>
      </section>

      <section className="panel columns">
        <article>
          <h2>Validation</h2>
          {validation.success ? (
            <p className="ok">Quest schema is valid.</p>
          ) : (
            <ul className="issues">
              {validation.error.issues.map((issue, index) => (
                <li key={`issue-${index}`}>
                  <code>{issue.path.join(".") || "$"}</code>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article>
          <h2>Preview</h2>
          <div className="preview-card">
            <h3>
              {quest.icon ?? "📌"} {quest.title}
            </h3>
            <p>{quest.description}</p>
            <p className="meta">
              {quest.difficulty} • repeat: {quest.repeat.kind}
            </p>
            <ul>
              {quest.steps.map((step, index) => (
                <li key={`preview-${index}`}>
                  {buildStepProgressText(step, Math.floor(getStepTarget(step) * 0.35))}
                </li>
              ))}
            </ul>
            <p className="reward-line">Rewards: {rewardSummary(quest)}</p>
          </div>
        </article>
      </section>

      <section className="panel">
        <h2>Raw JSON5</h2>
        <textarea
          value={rawJson}
          onChange={(event) => setRawJson(event.target.value)}
          rows={16}
          className="raw"
        />
      </section>
    </main>
  );
}

export default App;
