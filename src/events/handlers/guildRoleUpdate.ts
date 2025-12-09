/**
 * Reenvía el evento `guildRoleUpdate` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitGuildRoleUpdate } from "@/events/hooks/guildRole";

export default createEvent({
  data: { name: "guildRoleUpdate" },
  async run(...args) {
    await emitGuildRoleUpdate(...args);
  },
});
