import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

// Schema para items de `channels.core`: permite ausencia (undefined) o limpieza (null).
const CoreChannelSchema = z.object({ channelId: z.string() }).nullable().optional();

/**
 * Configuración del sistema de ofertas.
 *
 * Se guarda en `channels.core`:
 * - `offersReview`: canal donde se envían ofertas para revisión (requerido para crear ofertas).
 * - `approvedOffers`: canal donde se publican ofertas aprobadas (opcional).
 */
export const offersConfig = defineConfig(
  ConfigurableModule.Offers,
  z.object({
    offersReview: CoreChannelSchema,
    approvedOffers: CoreChannelSchema,
  }),
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.Offers]: z.infer<typeof offersConfig>;
  }
}

