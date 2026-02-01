/**
 * Motivation: register the "ping" command within the ping category to offer the action consistently and reusably.
 *
 * Idea/Concept: uses the Seyfert command framework with typed options and shared utilities to validate input and dispatch logic.
 *
 * Scope: handles command invocation and response; delegates business rules, persistence, and additional policies to specialized services or modules.
 */
import type { CommandContext } from "seyfert";
import { Command, Declare } from "seyfert";

import { ActionRow, Embed } from "seyfert";
import { Button, UI } from "@/modules/ui";
import { ButtonStyle } from "seyfert/lib/types";

@Declare({
  name: "rui-test",
  description: "reactive user interface test",
})
export default class RuiTestCommand extends Command {
  async run(ctx: CommandContext) {
    await new UI<{ count: number }>(
      { count: 0 },
      (state) => {
        const embed = new Embed().setDescription(`Clicks: ${state.count}`);

        const increment = new Button()
          .setLabel("+1")
          .setStyle(ButtonStyle.Primary)
          .onClick("increment", () => {
            state.count += 1;
          });

        return {
          embeds: [embed],
          components: [new ActionRow().addComponents(increment)],
        };
      },
      (msg) => ctx.editOrReply(msg),
    ).send();
  }
}
