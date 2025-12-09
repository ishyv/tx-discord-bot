/**
 * Reenvía el evento `inviteDelete` de Seyfert hacia los hooks internos.
 */
import { createEvent } from "seyfert";

import { emitInviteDelete } from "@/events/hooks/inviteEvents";

export default createEvent({
  data: { name: "inviteDelete" },
  async run(...args) {
    await emitInviteDelete(...args);
  },
});
