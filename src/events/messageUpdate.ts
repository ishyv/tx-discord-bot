import { createEvent } from "seyfert";

import { emitMessageUpdate } from "@/events/hooks/messageUpdate";

export default createEvent({
  data: { name: "messageUpdate" },
  async run(...args) {
    await emitMessageUpdate(...args);
  },
});
