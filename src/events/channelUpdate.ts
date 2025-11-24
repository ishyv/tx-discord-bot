import { createEvent } from "seyfert";

import { emitChannelUpdate } from "@/events/hooks/channelEvents";

export default createEvent({
  data: { name: "channelUpdate" },
  async run(...args) {
    await emitChannelUpdate(...args);
  },
});
