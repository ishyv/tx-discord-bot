import { createEvent } from "seyfert";

import { emitChannelCreate } from "@/events/hooks/channelEvents";

export default createEvent({
  data: { name: "channelCreate" },
  async run(...args) {
    await emitChannelCreate(...args);
  },
});
