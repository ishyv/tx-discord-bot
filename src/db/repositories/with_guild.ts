/**
 * Motivación: simplificar la modificación de configuraciones de guild mediante un patrón funcional.
 *
 * Idea/concepto: obtiene el documento, ejecuta un callback mutador y guarda los cambios automáticamente.
 *
 * Alcance: operaciones de configuración de baja concurrencia (settings, canales, roles).
 * NO USAR para contadores de alta frecuencia (XP, stats) donde se requiere atomicidad ($inc).
 */
import { connectMongo } from "@/db/client";
import { GuildModel, type GuildDoc, type GuildData } from "@/db/models/guild.schema";

/**
 * Modifies a guild document safely.
 * @param id Guild ID
 * @param callback Function that mutates the guild document
 * @returns The result of the callback
 */
export async function withGuild<T>(
    id: string,
    callback: (guild: GuildDoc) => Promise<T> | T
): Promise<T> {
    await connectMongo();

    // 1. Fetch (or create if missing)
    let doc = await GuildModel.findById(id);
    if (!doc) {
        // Create with defaults if not exists
        doc = await GuildModel.create({ _id: id });
    }

    // 2. Execute Callback
    const result = await callback(doc);

    // 3. Save changes
    // Aggressive marking for mixed types to ensure deep changes are saved
    doc.markModified("roles");
    doc.markModified("channels");
    doc.markModified("features");
    doc.markModified("reputation");
    doc.markModified("pendingTickets");

    await doc.save();

    return result;
}

/**
 * Retrieve a guild document by ID (read-only).
 */
export async function getGuild(id: string): Promise<GuildData | null> {
    await connectMongo();
    return GuildModel.findById(id).lean() as unknown as GuildData | null;
}

/**
 * Ensure a guild document exists, creating it if necessary.
 */
export async function ensureGuild(id: string): Promise<GuildData> {
    return withGuild(id, (guild) => guild.toObject() as GuildData);
}
