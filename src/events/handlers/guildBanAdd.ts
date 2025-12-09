/**
 * Reenvía el evento `guildBanAdd` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitGuildBanAdd } from "@/events/hooks/guildBan";

export default createEvent({
  data: { name: "guildBanAdd" },
  async run(...args) {
    await emitGuildBanAdd(...args);
  },
});
