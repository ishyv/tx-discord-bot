/**
 * Demo command for the proposed "no internal hooks" event model.
 * It installs a runtime wrapper over Seyfert's MESSAGE_CREATE handler and waits
 * for the next message from the invoking user in this channel.
 */
import { Command, Declare, Options, createStringOption, type CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { startMessageCreateDemo, stopMessageCreateDemo } from "@/modules/events-next";

const options = {
  action: createStringOption({
    description: "start or stop the demo listener",
    required: false,
    choices: [
      { name: "start", value: "start" },
      { name: "stop", value: "stop" },
    ],
  }),
};

@Declare({
  name: "new-event",
  description: "Demo for the proposed direct Seyfert event handler",
})
@Options(options)
export default class NewEventCommand extends Command {
  async run(ctx: CommandContext<typeof options>) {
    const action = ctx.options.action ?? "start";
    const channelId = ctx.channelId;
    if (!channelId) {
      await ctx.write({
        content: "No channel id available for this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "stop") {
      const stopped = stopMessageCreateDemo({
        userId: ctx.author.id,
        channelId,
        guildId: ctx.guildId ?? null,
      });

      await ctx.write({
        content:
          stopped.status === "stopped"
            ? "new-event demo stopped for this channel."
            : "new-event demo was not active in this channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = startMessageCreateDemo(ctx.client, {
      userId: ctx.author.id,
      channelId,
      guildId: ctx.guildId ?? null,
    });

    const remaining = Math.max(0, Math.ceil((result.expiresAt - Date.now()) / 1000));
    const statusLine =
      result.status === "already-active"
        ? "new-event demo already active here."
        : "new-event demo installed.";

    await ctx.write({
      content: `${statusLine} Send a message in this channel within ${remaining}s to see the handler reply.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
