/**
 * Motivación: extender tipos de seyfert middlewares para que el código del bot tenga autocompletado y chequeos consistentes.
 *
 * Idea/concepto: usa declaraciones de fusión/augmentations para agregar contratos a librerías externas.
 *
 * Alcance: solo afecta al tipado; no genera código en tiempo de ejecución.
 */
import type { ParseMiddlewares } from "seyfert";
import type * as middlewares from "@/middlewares";

declare module "seyfert" {
  interface RegisteredMiddlewares
    extends ParseMiddlewares<typeof middlewares> {}
}
