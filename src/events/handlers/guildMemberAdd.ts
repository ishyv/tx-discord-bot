/**
 * Reenvía el evento `guildMemberAdd` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitGuildMemberAdd } from "@/events/hooks/guildMember";

export default createEvent({
  data: { name: "guildMemberAdd" },
  async run(...args) {
    await emitGuildMemberAdd(...args);
  },
});
