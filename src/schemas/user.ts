/**
 * Motivación: definir el contrato de datos user para asegurar que el resto del código consuma estructuras consistentes.
 *
 * Idea/concepto: usa tipos/interfaces para describir campos esperados y su intención en el dominio.
 *
 * Alcance: solo declara formas de datos; no valida en tiempo de ejecución ni persiste información.
 */
export interface Warn {
  reason: string;
  warn_id: string; // lowercase Crockford base32 slug
  moderator: string;
  timestamp: string; // Date ISO
}

export interface User {
  id: string;
  bank: number;
  cash: number;
  rep: number;
  warns: Warn[] | null;
  openTickets: string[] | null;
}
