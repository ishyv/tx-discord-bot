import { createEvent } from "seyfert";

import { emitMessageDeleteBulk } from "@/events/hooks/messageDelete";

export default createEvent({
  data: { name: "messageDeleteBulk" },
  async run(data, client, shardId) {
    await emitMessageDeleteBulk(data, client, shardId);
  },
});
