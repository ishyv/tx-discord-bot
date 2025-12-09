/**
 * Reenvía el evento `guildMemberUpdate` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitGuildMemberUpdate } from "@/events/hooks/guildMember";

export default createEvent({
  data: { name: "guildMemberUpdate" },
  async run(...args) {
    await emitGuildMemberUpdate(...args);
  },
});
