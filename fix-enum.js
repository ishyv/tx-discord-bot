const fs = require("fs");

const files = [
  {
    path: "src/commands/moderation/warn/remove.command.ts",
    old: '"warns"',
    new: "Features.Warns",
  },
  {
    path: "src/commands/moderation/warn/list.command.ts",
    old: '"warns"',
    new: "Features.Warns",
  },
  {
    path: "src/commands/moderation/warn/clear.command.ts",
    old: '"warns"',
    new: "Features.Warns",
  },
  {
    path: "src/components/ticket_select_handler.ts",
    old: '"tickets"',
    new: "Features.Tickets",
  },
  {
    path: "src/components/rep_modal_handler.ts",
    old: '"reputation"',
    new: "Features.Reputation",
  },
  {
    path: "src/components/rep_request_handler.ts",
    old: '"reputation"',
    new: "Features.Reputation",
  },
];

files.forEach(({ path, old, new: replacement }) => {
  let content = fs.readFileSync(path, "utf8");

  // Add Features import if not present
  if (!content.includes(", Features ")) {
    content = content.replace(
      'import { assertFeatureEnabled } from "@/modules/features";',
      'import { assertFeatureEnabled, Features } from "@/modules/features";'
    );
  }

  // Replace the old string with new enum
  content = content.replace(old, replacement);

  fs.writeFileSync(path, content, "utf8");
  console.log(`Fixed: ${path}`);
});

console.log("All files updated!");
