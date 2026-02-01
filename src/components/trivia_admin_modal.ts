/**
 * Trivia Admin Modal Handler (Phase 9c).
 *
 * Purpose: Handle question submission modal from trivia-admin add command.
 */
import { ModalCommand, type ModalContext, Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import { 
  CATEGORY_INFO, 
  DIFFICULTY_CONFIG,
  type TriviaCategory,
  type TriviaDifficulty,
} from "@/modules/economy/minigames";

const VALID_CATEGORIES = Object.keys(CATEGORY_INFO) as TriviaCategory[];

export default class TriviaAdminModalHandler extends ModalCommand {
  filter(ctx: ModalContext) {
    return ctx.customId.startsWith("trivia:add:");
  }

  async run(ctx: ModalContext) {
    const parts = ctx.customId.split(":");
    const expectedUserId = parts[2];
    const actualUserId = ctx.interaction.user.id;

    // Security: Verify the user submitting is the same who opened the modal
    if (actualUserId !== expectedUserId) {
      await ctx.write({
        content: "❌ No puedes enviar preguntas por otra persona.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Extract values from modal
    const fields = ctx.interaction.components?.flatMap(
      (row: any) => row.components ?? []
    ) ?? [];

    const values: Record<string, string> = {};
    for (const comp of fields) {
      if (comp?.custom_id) {
        values[comp.custom_id] = comp.value?.trim() ?? "";
      }
    }

    // Validate required fields
    const requiredFields = ["question", "category", "difficulty", "options", "correct_and_explanation"];
    for (const field of requiredFields) {
      if (!values[field]) {
        await ctx.write({
          content: `❌ El campo "${field}" es obligatorio.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Parse and validate category
    const categoryInput = values.category.toLowerCase().trim();
    if (!VALID_CATEGORIES.includes(categoryInput as TriviaCategory)) {
      await ctx.write({
        content: `❌ Categoría inválida. Usa una de: ${VALID_CATEGORIES.join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const category = categoryInput as TriviaCategory;

    // Parse and validate difficulty
    const difficultyNum = parseInt(values.difficulty.trim(), 10);
    if (isNaN(difficultyNum) || difficultyNum < 1 || difficultyNum > 5) {
      await ctx.write({
        content: "❌ Dificultad inválida. Usa un número del 1 al 5.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const difficulty = difficultyNum as TriviaDifficulty;

    // Parse options
    const optionsStr = values.options;
    const options = optionsStr.split("|").map(o => o.trim()).filter(o => o.length > 0);
    
    if (options.length !== 4) {
      await ctx.write({
        content: `❌ Debes proporcionar exactamente 4 opciones separadas por | (encontradas: ${options.length}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Parse correct answer and explanation
    const correctAndExpParts = values.correct_and_explanation.split("|").map(p => p.trim());
    if (correctAndExpParts.length < 2) {
      await ctx.write({
        content: "❌ Formato inválido. Usa: 'índice | explicación' (ej: '0 | Porque...')",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const correctIndex = parseInt(correctAndExpParts[0], 10);
    if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      await ctx.write({
        content: "❌ Índice de respuesta correcta inválido. Usa 0, 1, 2 o 3.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const explanation = correctAndExpParts.slice(1).join(" | "); // Rejoin in case | was used in explanation
    if (explanation.length < 10) {
      await ctx.write({
        content: "❌ La explicación debe tener al menos 10 caracteres.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Generate question ID
    const timestamp = Date.now();
    const questionId = `${category}_${timestamp.toString(36).slice(-6)}`;

    // Build preview embed
    const diffConfig = DIFFICULTY_CONFIG[difficulty];
    const catInfo = CATEGORY_INFO[category];

    const embed = new Embed()
      .setColor(EmbedColors.Green)
      .setTitle("✅ Pregunta Validada - Vista Previa")
      .setDescription(
        `**Pregunta:** ${values.question}\n\n` +
        `**Opciones:**\n` +
        options.map((opt, i) => `${["A", "B", "C", "D"][i]}) ${opt}${i === correctIndex ? " ✅" : ""}`).join("\n") +
        `\n\n**Explicación:** ${explanation}`
      )
      .addFields(
        {
          name: "📋 Metadata",
          value: 
            `ID: \`${questionId}\`\n` +
            `Categoría: ${catInfo.emoji} ${catInfo.name}\n` +
            `Dificultad: ${diffConfig.emoji} ${diffConfig.name} (${difficulty}/5)`,
          inline: true,
        },
        {
          name: "💰 Recompensas",
          value:
            `Monedas: x${diffConfig.currencyMultiplier}\n` +
            `XP: x${diffConfig.xpMultiplier}`,
          inline: true,
        }
      )
      .setFooter({ text: "Esta pregunta está lista para ser agregada al código fuente." });

    // Generate code snippet for easy copy-paste
    const codeSnippet = `
{
  id: "${questionId}",
  question: "${values.question.replace(/"/g, '\\"')}",
  options: ["${options.join('", "')}"],
  correctIndex: ${correctIndex},
  category: "${category}",
  difficulty: ${difficulty},
  explanation: "${explanation.replace(/"/g, '\\"')}",
  tags: ["${category}", "pending"],
},`;

    await ctx.write({
      content: "📋 **Pregunta lista para agregar**\nCopia este código al archivo de categoría correspondiente:",
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });

    // Also send the code snippet in a separate message for easy copy
    await ctx.write({
      content: `\`\`\`typescript\n${codeSnippet.trim()}\n\`\`\``,      
      flags: MessageFlags.Ephemeral,
    });
  }
}
