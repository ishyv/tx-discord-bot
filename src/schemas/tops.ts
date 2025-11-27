/**
 * Motivación: definir las estructuras de datos del sistema de TOPs para que el resto del código
 * consuma formas consistentes al leer o escribir configuraciones, ventanas y reportes históricos.
 *
 * Idea/concepto: describir tanto la ventana activa (contadores en curso) como los snapshots
 * almacenados cada vez que se envía un reporte.
 *
 * Alcance: solo declara tipos/contratos; no ejecuta lógica de negocio ni accede a la base de datos.
 */

export interface TopWindowRecord {
  guildId: string;
  channelId: string | null;
  intervalMs: number;
  topSize: number;
  windowStartedAt: Date;
  lastReportAt: Date | null;
  emojiCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  reputationDeltas: Record<string, number>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TopReportRecord {
  id: string;
  guildId: string;
  periodStart: Date;
  periodEnd: Date;
  intervalMs: number;
  emojiCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  reputationDeltas: Record<string, number>;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}
