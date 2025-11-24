import { createEvent } from "seyfert";

import { emitChannelDelete } from "@/events/hooks/channelEvents";

export default createEvent({
  data: { name: "channelDelete" },
  async run(...args) {
    await emitChannelDelete(...args);
  },
});
