/**
 * Motivación: exponer utilidades comunes sobre entidades de guild (miembros, roles) sin duplicar consultas y verificaciones.
 *
 * Idea/concepto: funciones puras que envuelven llamadas de cliente para chequear permisos, roles y estados.
 *
 * Alcance: pensado como helper liviano; no gestiona caché global ni sincroniza con la base de datos.
 */
import type { Guild } from "seyfert";

export const getMemberName = async (
  id: string,
  guild: Awaited<Guild<"cached" | "api">>,
) => {
  try {
    const member = await guild.members.fetch(id);
    return member.name;
  } catch {
    return "Desconocido";
  }
};
