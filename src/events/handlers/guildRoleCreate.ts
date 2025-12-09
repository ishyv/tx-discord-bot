/**
 * Reenvía el evento `guildRoleCreate` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitGuildRoleCreate } from "@/events/hooks/guildRole";

export default createEvent({
  data: { name: "guildRoleCreate" },
  async run(...args) {
    await emitGuildRoleCreate(...args);
  },
});
