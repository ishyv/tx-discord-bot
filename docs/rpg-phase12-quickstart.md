# RPG Shared Primitives - Quick Reference

Quick examples for using Phase 12 shared utilities.

## UI Utilities

### Import

```typescript
import {
  formatInstanceTag,
  renderBar,
  renderHpBar,
  renderDurabilityBar,
  renderStatLine,
  renderStatDelta,
  buildCompactEmbed,
  buildErrorEmbed,
  buildConfirmFlow,
  buildPagedSelect,
} from "@/modules/rpg/ui";
```

### Format Instance Tags

```typescript
const tag = formatInstanceTag("abc123def456789");
// Returns: "#ef456789" (last 6 chars)

// Use in inventory display:
const display = `Iron Sword ${formatInstanceTag(instance.id)} (${durability}/100)`;
```

### Render Bars

```typescript
// Generic bar
const bar = renderBar(75, 100); // Default 10 width
// Returns: "███████░░░"

// Custom width
const bar = renderBar(33, 100, 15); // 15 char wide
// Returns: "█████░░░░░░░░░░"

// HP bar with values
const hpDisplay = renderHpBar(42, 100);
// Returns: "████░░░░░░ 42/100"

// Durability bar
const durDisplay = renderDurabilityBar(70, 100);
// Returns: "███████░░░ 70/100"
```

### Display Stats

```typescript
// Compact stat line
const stats = { atk: 15, def: 8, maxHp: 120 };
const line = renderStatLine(stats);
// Returns: "ATK 15 | DEF 8 | HP 120"

// Stat changes (before → after)
const before = { atk: 12, def: 8, maxHp: 100 };
const after = { atk: 15, def: 8, maxHp: 120 };
const delta = renderStatDelta(before, after);
// Returns: "+3 ATK, +20 HP"
```

### Build Embeds

```typescript
// Simple compact embed
const embed = buildCompactEmbed(
  "⚔️ Action Complete",
  [
    "You mined 3 iron ore",
    "+15 XP (x1.04 streak)",
    "Pickaxe durability: 85/100",
  ],
  "💡 Tip: Process ore into ingots!",
);

// Error embed
const errorEmbed = buildErrorEmbed(
  "INSUFFICIENT_DURABILITY",
  "Your tool is broken and cannot be used.",
  "Repair it using /rpg upgrade or equip a new one.",
);

// Confirmation flow
const { embed, confirmId, cancelId } = buildConfirmFlow({
  title: "Equip Iron Sword?",
  description: "This will replace your current weapon.",
  fields: [
    { name: "Stats", value: "+5 ATK", inline: true },
    { name: "Durability", value: "100/100", inline: true },
  ],
  confirmId: "equip_confirm_abc123",
  cancelId: "equip_cancel_abc123",
});

// Use with button row
const row = createConfirmCancelRow(confirmId, cancelId);
await interaction.write({ embeds: [embed], components: [row] });
```

### Pagination

```typescript
const items = [
  /* array of 50 items */
];
const page = 0;
const pageSize = 10;

const pagination = buildPagedSelect(
  items,
  page,
  pageSize,
  (item, idx) => `${idx + 1}. ${item.name}`, // Label function
  (item, idx) => item.id, // Value function
);

// Use pagination.options in StringSelectMenu
// Use pagination.hasNext / hasPrev for button states
```

---

## RNG Utilities

### Import

```typescript
import {
  makeActionRng,
  makeSimpleRng,
  rollChance,
  pickRandom,
  rollInt,
  rollFloat,
  createRng, // Re-exported from combat engine
  nextRandom, // Re-exported
  type RngState, // Re-exported
} from "@/modules/rpg/rng";
```

### Action RNG (Deterministic)

```typescript
// Create RNG for a specific action
const rng = makeActionRng({
  guildId: interaction.guildId,
  userId: interaction.user.id,
  correlationId: "mine_abc123_def456", // Unique ID for this transaction
  actionType: "mine",
  actionIndex: 0, // For multiple rolls in same action
});

// All rolls using this RNG are reproducible with same params
const dropped = rollChance(rng, 0.01); // 1% chance

// For multiple rolls in same action, increment actionIndex
const rng2 = makeActionRng({ ...params, actionIndex: 1 });
const bonusApplied = rollChance(rng2, 0.05);
```

### Simple RNG (Testing)

```typescript
// For unit tests
const rng = makeSimpleRng(12345);
const result = rollChance(rng, 0.5);
// Always same result with seed 12345
```

### Roll Functions

```typescript
const rng = makeActionRng({...});

// Probability check (0-1)
if (rollChance(rng, 0.05)) {
  console.log("5% rare event triggered!");
}

// Pick random from array
const rewards = ["iron_ore", "copper_ore", "stone"];
const reward = pickRandom(rng, rewards);

// Random integer [min, max] inclusive
const damageBonus = rollInt(rng, 1, 5);  // 1-5

// Random float [min, max)
const multiplier = rollFloat(rng, 1.0, 1.5);  // 1.0-1.5
```

### Drop Roll Example

```typescript
function rollForDrop(
  guildId: string,
  userId: string,
  correlationId: string,
  actionType: "mine" | "process",
  tier: number,
): string | null {
  const rng = makeActionRng({ guildId, userId, correlationId, actionType });

  // Tier 2+ mining has 1% chance for gem fragment
  if (actionType === "mine" && tier >= 2) {
    if (rollChance(rng, 0.01)) {
      return "gem_fragment";
    }
  }

  // Processing has 5% chance for perfect ingot
  if (actionType === "process") {
    if (rollChance(rng, 0.05)) {
      return "perfect_ingot";
    }
  }

  return null;
}
```

---

## Reward Service

### Import

```typescript
import { rpgRewardService } from "@/modules/rpg/rewards/service";
import type {
  AwardXpInput,
  GrantItemInput,
} from "@/modules/rpg/rewards/service";
```

### Award XP

```typescript
const result = await rpgRewardService.awardXp({
  guildId: interaction.guildId!,
  userId: interaction.user.id,
  amount: 50, // Base XP
  reason: "Mined 3 iron ore",
  correlationId: "mine_abc123",
  modifiers: {
    streakMultiplier: 1.06, // 6% streak bonus
  },
});

if (result.isOk()) {
  const { xpGained, newLevel, leveledUp } = result.unwrap();

  let message = `+${xpGained} XP`;
  if (modifiers.streakMultiplier > 1.0) {
    message += ` (x${modifiers.streakMultiplier.toFixed(2)} streak)`;
  }

  if (leveledUp) {
    message += `\\nLEVEL UP ${oldLevel} → ${newLevel}`;
  }

  // Show in embed
}
```

### Grant Item

```typescript
const result = await rpgRewardService.grantItem({
  guildId: interaction.guildId!,
  userId: interaction.user.id,
  itemId: "gem_fragment",
  quantity: 1,
  reason: "Rare drop from mining",
  correlationId: "mine_abc123",
});

if (result.isOk()) {
  const { itemId, quantity, isNew } = result.unwrap();

  const message = isNew
    ? `✨ **First time!** You found: ${itemId} x${quantity}`
    : `You found: ${itemId} x${quantity}`;
}
```

---

## Integration Patterns

### Progression Hook Pattern

```typescript
// In gathering service, after successful gather:

async function executeGather(...) {
  // ... existing gather logic ...

  // Award XP
  const xpConfig = await getRpgConfig(guildId);
  if (xpConfig.progression.enabled) {
    const baseXp = xpConfig.progression.xpPerAction.mine;

    // Get streak multiplier from progression service
    const streakMult = await progressionService.computeXpMultiplier(userId, guildId);

    await rpgRewardService.awardXp({
      guildId,
      userId,
      amount: baseXp,
      reason: `Mined ${result.materialId} x${result.quantity}`,
      correlationId,
      modifiers: { streakMultiplier: streakMult },
    });

    // Record action for streak
    await progressionService.recordAction(userId, guildId, "mine", correlationId);
  }

  // Roll for drop
  const dropConfig = await getRpgConfig(guildId);
  if (dropConfig.drops.enabled) {
    const rng = makeActionRng({ guildId, userId, correlationId, actionType: "mine" });
    const drop = rollForDrop(rng, actionType, tier);

    if (drop) {
      await rpgRewardService.grantItem({
        guildId,
        userId,
        itemId: drop,
        quantity: 1,
        reason: "Rare drop from mining",
        correlationId,
      });

      // Show "✨ Rare drop!" message
    }
  }
}
```

### Quest Hook Pattern

```typescript
// In equipment service, after equip:

async function executeEquip(...) {
  // ... existing equip logic ...

  // Trigger quest hook
  await questHooks.onEquip(userId, guildId, slot, itemId);
}

// In quest hooks module:
export async function onEquip(
  userId: string,
  guildId: string,
  slot: EquipmentSlot,
  itemId: string | null,
): Promise<void> {
  if (!itemId) return;  // Only track equips, not unequips

  // Call existing quest progression service
  await questService.updateProgress({
    guildId,
    userId,
    requirementType: "rpg_equip",
    increment: 1,
    metadata: { slot, itemId },
  });
}
```

---

## Best Practices

### DO ✅

- Use `makeActionRng()` with stable correlationId for reproducibility
- Use UI utilities for consistent formatting
- Award rewards through `rpgRewardService`
- Include correlationId in audit metadata
- Test RNG-based logic with fixed seeds

### DON'T ❌

- Don't use `Math.random()` in services (breaks determinism)
- Don't create ad-hoc embed builders (use shared utilities)
- Don't directly mutate user XP/items (use reward service)
- Don't duplicate bar rendering logic
- Don't forget to audit reward grants

### Testing

```typescript
// Unit test for RNG determinism
test("drop roll is deterministic", () => {
  const rng1 = makeSimpleRng(12345);
  const result1 = rollChance(rng1, 0.01);

  const rng2 = makeSimpleRng(12345);
  const result2 = rollChance(rng2, 0.01);

  expect(result1).toBe(result2); // Always same
});

// Integration test with action RNG
test("same action produces same drop", async () => {
  const params = {
    guildId: "test_guild",
    userId: "test_user",
    correlationId: "unique_action_1",
    actionType: "mine",
  };

  const drop1 = rollForDrop(params);
  const drop2 = rollForDrop(params); // Same params

  expect(drop1).toBe(drop2); // Reproducible
});
```

---

## Complete Example: Mining with All Features

```typescript
async function executeMine(
  interaction: CommandInteraction,
  location: "mine" | "forest",
  tier: number,
) {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const correlationId = `mine_${Date.now()}_${randomId()}`;

  // 1. Execute base mining logic
  const gatherResult = await gatheringService.gather({
    userId,
    guildId,
    location,
    tier,
    correlationId,
  });

  if (gatherResult.isErr()) {
    return interaction.write({
      embeds: [buildErrorEmbed("GATHER_FAILED", gatherResult.error.message)],
    });
  }

  const { materialId, quantity, durability } = gatherResult.unwrap();

  // 2. Award XP with streak
  const config = await getRpgConfig(guildId);
  let xpMessage = "";

  if (config.progression.enabled) {
    const baseXp = config.progression.xpPerAction.mine;
    const streakMult = await progressionService.computeXpMultiplier(
      userId,
      guildId,
    );

    const xpResult = await rpgRewardService.awardXp({
      guildId,
      userId,
      amount: baseXp,
      reason: `Mined ${materialId} x${quantity}`,
      correlationId,
      modifiers: { streakMultiplier: streakMult },
    });

    if (xpResult.isOk()) {
      const { xpGained, leveledUp, oldLevel, newLevel } = xpResult.unwrap();
      xpMessage = `+${xpGained} XP`;
      if (streakMult > 1.0) xpMessage += ` (x${streakMult.toFixed(2)} streak)`;
      if (leveledUp) xpMessage += `\\nLEVEL UP ${oldLevel} → ${newLevel}`;
    }

    await progressionService.recordAction(
      userId,
      guildId,
      "mine",
      correlationId,
    );
  }

  // 3. Roll for rare drop
  let dropMessage = "";
  if (config.drops.enabled && tier >= 2) {
    const rng = makeActionRng({
      guildId,
      userId,
      correlationId,
      actionType: "mine",
    });
    if (rollChance(rng, 0.01)) {
      // 1% chance
      await rpgRewardService.grantItem({
        guildId,
        userId,
        itemId: "gem_fragment",
        quantity: 1,
        reason: "Rare drop from mining",
        correlationId,
      });
      dropMessage = "\\n✨ **Rare drop:** Gem Fragment";
    }
  }

  // 4. Build response embed
  const embed = buildCompactEmbed(
    "⛏️ Mining Complete",
    [
      `You mined **${materialId}** x${quantity}`,
      xpMessage,
      dropMessage,
      `Tool durability: ${renderDurabilityBar(durability.current, durability.max)}`,
    ].filter(Boolean),
    "💡 Process ore into ingots for better rewards!",
  );

  // 5. Trigger quest hook
  await questHooks.onGather(userId, guildId, "mine", quantity);

  return interaction.write({ embeds: [embed] });
}
```

---

This quick reference covers the most common patterns. Refer to the full documentation for schema details and service architecture.
