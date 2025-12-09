/**
 * Reenvía el evento `guildMemberRemove` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitGuildMemberRemove } from "@/events/hooks/guildMember";

export default createEvent({
  data: { name: "guildMemberRemove" },
  async run(...args) {
    await emitGuildMemberRemove(...args);
  },
});
