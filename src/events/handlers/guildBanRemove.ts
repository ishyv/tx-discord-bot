/**
 * Reenvía el evento `guildBanRemove` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitGuildBanRemove } from "@/events/hooks/guildBan";

export default createEvent({
  data: { name: "guildBanRemove" },
  async run(...args) {
    await emitGuildBanRemove(...args);
  },
});
