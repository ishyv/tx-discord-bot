import { createEvent } from "seyfert";

import { emitGuildRoleDelete } from "@/events/hooks/guildRole";

export default createEvent({
  data: { name: "guildRoleDelete" },
  async run(role, client, shardId) {
    await emitGuildRoleDelete(role, client, shardId);
  },
});

