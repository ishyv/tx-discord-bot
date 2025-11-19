import { createEvent } from "seyfert";

import { emitMessageDelete } from "@/events/hooks/messageDelete";

export default createEvent({
  data: { name: "messageDelete" },
  async run(data, client, shardId) {
    await emitMessageDelete(data, client, shardId);
  },
});
