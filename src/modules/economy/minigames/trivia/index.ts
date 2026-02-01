/**
 * Trivia Question Database (Phase 9c).
 *
 * Purpose: Comprehensive question database with 250+ questions across 8 categories.
 * Categories: tech, gaming, anime, history, general, science, music, memes
 * Difficulty: 1-5 scale with reward multipliers
 */

import type { TriviaQuestion, TriviaCategory, TriviaDifficulty, DifficultyConfig, CategoryInfo, QuestionFilter } from "./types";

// Import question sets
import { techQuestions } from "./questions-tech";
import { gamingQuestions } from "./questions-gaming";
import { animeQuestions } from "./questions-anime";
import { programmingQuestions } from "./questions-programming";
import { generalQuestions } from "./questions-general";
import { scienceQuestions } from "./questions-science";
import { historyQuestions } from "./questions-history";
import { musicQuestions } from "./questions-music";
import { memeQuestions } from "./questions-memes";
import { extraQuestions } from "./questions-extra";

// Combine all questions
export const ALL_QUESTIONS: readonly TriviaQuestion[] = [
  ...techQuestions,
  ...gamingQuestions,
  ...animeQuestions,
  ...programmingQuestions,
  ...generalQuestions,
  ...scienceQuestions,
  ...historyQuestions,
  ...musicQuestions,
  ...memeQuestions,
  ...extraQuestions,
] as const;

// Total count
export const TOTAL_QUESTIONS = ALL_QUESTIONS.length;

// Difficulty configurations
export const DIFFICULTY_CONFIG: Record<TriviaDifficulty, DifficultyConfig> = {
  1: { level: 1, name: "Muy Fácil", emoji: "🟢", currencyMultiplier: 1.0, xpMultiplier: 1.0, color: 0x00ff00 },
  2: { level: 2, name: "Fácil", emoji: "🟩", currencyMultiplier: 1.2, xpMultiplier: 1.1, color: 0x66ff66 },
  3: { level: 3, name: "Medio", emoji: "🟡", currencyMultiplier: 1.5, xpMultiplier: 1.3, color: 0xffff00 },
  4: { level: 4, name: "Difícil", emoji: "🟠", currencyMultiplier: 2.0, xpMultiplier: 1.6, color: 0xff9900 },
  5: { level: 5, name: "Experto", emoji: "🔴", currencyMultiplier: 3.0, xpMultiplier: 2.0, color: 0xff0000 },
};

// Category information
export const CATEGORY_INFO: Record<TriviaCategory, CategoryInfo> = {
  tech: { id: "tech", name: "Tecnología", emoji: "💻", description: "Hardware, software y tecnología" },
  gaming: { id: "gaming", name: "Videojuegos", emoji: "🎮", description: "Juegos, consolas y cultura gamer" },
  anime: { id: "anime", name: "Anime", emoji: "🎌", description: "Anime, manga y cultura japonesa" },
  history: { id: "history", name: "Historia", emoji: "📜", description: "Eventos históricos y personajes" },
  general: { id: "general", name: "General", emoji: "🌍", description: "Cultura general y curiosidades" },
  science: { id: "science", name: "Ciencia", emoji: "🔬", description: "Biología, química, física y astronomía" },
  programming: { id: "programming", name: "Programación", emoji: "💻", description: "Código, desarrollo y software" },
  music: { id: "music", name: "Música", emoji: "🎵", description: "Música, artistas y teoría musical" },
  memes: { id: "memes", name: "Memes", emoji: "😂", description: "Cultura de internet y memes" },
};

// Get questions by category
export function getQuestionsByCategory(category: TriviaCategory): TriviaQuestion[] {
  return ALL_QUESTIONS.filter((q) => q.category === category);
}

// Get questions by difficulty
export function getQuestionsByDifficulty(difficulty: TriviaDifficulty): TriviaQuestion[] {
  return ALL_QUESTIONS.filter((q) => q.difficulty === difficulty);
}

// Get random question with optional filters
export function getRandomQuestion(filter?: QuestionFilter): TriviaQuestion {
  let pool = [...ALL_QUESTIONS];

  if (filter?.categories?.length) {
    pool = pool.filter((q) => filter.categories!.includes(q.category));
  }

  if (filter?.minDifficulty !== undefined) {
    pool = pool.filter((q) => q.difficulty >= filter.minDifficulty!);
  }

  if (filter?.maxDifficulty !== undefined) {
    pool = pool.filter((q) => q.difficulty <= filter.maxDifficulty!);
  }

  if (filter?.excludeIds?.length) {
    pool = pool.filter((q) => !filter.excludeIds!.includes(q.id));
  }

  // Default to all questions if filter results in empty pool
  if (pool.length === 0) {
    pool = [...ALL_QUESTIONS];
  }

  // Weight by difficulty (higher difficulty = less frequent but still possible)
  const weightedPool: TriviaQuestion[] = [];
  for (const q of pool) {
    const weight = 6 - q.difficulty; // Difficulty 1 gets weight 5, 5 gets weight 1
    for (let i = 0; i < weight; i++) {
      weightedPool.push(q);
    }
  }

  return weightedPool[Math.floor(Math.random() * weightedPool.length)];
}

// Get question by ID
export function getQuestionById(id: string): TriviaQuestion | undefined {
  return ALL_QUESTIONS.find((q) => q.id === id);
}

// Validate answer
export function validateAnswer(questionId: string, answerIndex: number): boolean {
  const question = getQuestionById(questionId);
  if (!question) return false;
  return question.correctIndex === answerIndex;
}

// Calculate rewards based on difficulty and streak
export function calculateRewards(
  difficulty: TriviaDifficulty,
  baseCurrency: number,
  baseXP: number,
  streak: number = 0,
  streakEnabled: boolean = true,
  streakBonusPerQuestion: number = 0.1,
  maxStreakBonus: number = 0.5,
): { currency: number; xp: number; breakdown: { base: number; difficulty: number; streak: number } } {
  const config = DIFFICULTY_CONFIG[difficulty];
  
  // Calculate difficulty bonus
  const difficultyCurrency = Math.floor(baseCurrency * (config.currencyMultiplier - 1));
  const difficultyXP = Math.floor(baseXP * (config.xpMultiplier - 1));
  
  // Calculate streak bonus
  let streakCurrency = 0;
  let streakXP = 0;
  
  if (streakEnabled && streak > 0) {
    const streakMultiplier = Math.min(streak * streakBonusPerQuestion, maxStreakBonus);
    streakCurrency = Math.floor((baseCurrency + difficultyCurrency) * streakMultiplier);
    streakXP = Math.floor((baseXP + difficultyXP) * streakMultiplier);
  }
  
  return {
    currency: baseCurrency + difficultyCurrency + streakCurrency,
    xp: baseXP + difficultyXP + streakXP,
    breakdown: {
      base: baseCurrency,
      difficulty: difficultyCurrency,
      streak: streakCurrency,
    },
  };
}

// Get category statistics
export function getCategoryStats(): Record<TriviaCategory, { total: number; byDifficulty: Record<TriviaDifficulty, number> }> {
  const stats = {} as Record<TriviaCategory, { total: number; byDifficulty: Record<TriviaDifficulty, number> }>;
  
  for (const category of Object.keys(CATEGORY_INFO) as TriviaCategory[]) {
    const questions = getQuestionsByCategory(category);
    stats[category] = {
      total: questions.length,
      byDifficulty: {
        1: questions.filter((q) => q.difficulty === 1).length,
        2: questions.filter((q) => q.difficulty === 2).length,
        3: questions.filter((q) => q.difficulty === 3).length,
        4: questions.filter((q) => q.difficulty === 4).length,
        5: questions.filter((q) => q.difficulty === 5).length,
      },
    };
  }
  
  return stats;
}

// Export types
export type { TriviaQuestion, TriviaCategory, TriviaDifficulty, DifficultyConfig, CategoryInfo, QuestionFilter };
