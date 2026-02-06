import { buildInventoryItemLine, renderProgressBar } from "../../src/modules/economy/account/formatting";
import { assertEqual } from "../db-tests/_utils/assert";
import { ops, type Suite } from "../db-tests/_utils/runner";

export const suite: Suite = {
    name: "Inventory UX Upgrade",
    tests: [
        {
            name: "renders progress bar correctly",
            ops: [ops.read],
            async run() {
                const bar50 = renderProgressBar(50, 10);
                // 50% of 10 is 5.
                // Check for 5 filled, 5 empty.
                // Default chars: █ and ░
                const filled = "█".repeat(5);
                const empty = "░".repeat(5);
                assertEqual(bar50, filled + empty, "50% bar should be half filled");

                const bar0 = renderProgressBar(0, 5);
                assertEqual(bar0, "░".repeat(5), "0% bar should be empty");

                const bar100 = renderProgressBar(100, 5);
                assertEqual(bar100, "█".repeat(5), "100% bar should be full");
            }
        },
        {
            name: "formats instance-based items with durability",
            ops: [ops.read],
            async run() {
                const item = {
                    id: "pickaxe",
                    name: "Iron Pickaxe",
                    emoji: "⛏️",
                    quantity: 1,
                    description: "A sturdy pickaxe",
                    category: "tools" as const,
                    isInstanceBased: true,
                    instances: [
                        {
                            instanceId: "uuid-123456",
                            durability: 50,
                            maxDurability: 100
                        }
                    ]
                };

                const line = buildInventoryItemLine(item);

                // Expected format: ⛏️ **Iron Pickaxe** `#123456` [Bar] `50/100`
                // Note: buildInventoryItemLine calls renderProgressBar(percent, 5)

                // Check essential parts
                if (!line.includes("#123456")) {
                    throw new Error(`Expected short ID #123456, got: ${line}`);
                }
                if (!line.includes("50/100")) {
                    throw new Error(`Expected durability 50/100, got: ${line}`);
                }
                if (!line.includes("Iron Pickaxe")) {
                    throw new Error(`Expected name, got: ${line}`);
                }

                // Check bar presence (approximate)
                if (!line.includes("█") && !line.includes("░")) {
                    throw new Error(`Expected progress bar, got: ${line}`);
                }
            }
        },
        {
            name: "formats multiple instances",
            ops: [ops.read],
            async run() {
                const item = {
                    id: "sword",
                    name: "Sword",
                    emoji: "⚔️",
                    quantity: 2,
                    description: "Sharp",
                    category: "gear" as const,
                    isInstanceBased: true,
                    instances: [
                        { instanceId: "uuid-111111", durability: 10, maxDurability: 100 },
                        { instanceId: "uuid-222222", durability: 90, maxDurability: 100 }
                    ]
                };

                const line = buildInventoryItemLine(item);
                const lines = line.split("\n");

                assertEqual(lines.length, 2, "Should have 2 lines");
                if (!lines[0].includes("#111111")) throw new Error(`First line missing ID 111111. Got: ${lines[0]}`);
                if (!lines[1].includes("#222222")) throw new Error(`Second line missing ID 222222. Got: ${lines[1]}`);
            }
        },
        {
            name: "formats stackable items normally",
            ops: [ops.read],
            async run() {
                const item = {
                    id: "wood",
                    name: "Wood",
                    emoji: "🪵",
                    quantity: 50,
                    description: "Logs",
                    category: "materials" as const,
                    isInstanceBased: false,
                    instances: undefined
                };

                const line = buildInventoryItemLine(item);
                assertEqual(line, "🪵 **Wood** x50", "Stackable format incorrect");
            }
        }
    ]
};
