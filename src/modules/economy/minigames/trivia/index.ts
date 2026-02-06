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

const fallbackQuestions: readonly TriviaQuestion[] = [
  {
    id: "fallback-tech-1",
    question: "What does CPU stand for?",
    options: ["Central Processing Unit", "Computer Program Utility", "Core Performance Unit", "Central Program Upload"],
    correctIndex: 0,
    category: "tech",
    difficulty: 1,
    explanation: "CPU stands for Central Processing Unit, the main processor in a computer.",
    tags: ["hardware", "cpu"],
  },
  {
    id: "fallback-gaming-1",
    question: "Which company created the Nintendo Switch?",
    options: ["Sony", "Microsoft", "Nintendo", "Sega"],
    correctIndex: 2,
    category: "gaming",
    difficulty: 1,
    explanation: "Nintendo designed and released the Nintendo Switch in 2017.",
    tags: ["gaming", "console"],
  },
  {
    id: "fallback-anime-1",
    question: "In anime, what does 'OVA' usually refer to?",
    options: ["Original Video Animation", "Official Voice Actor", "Open Visual Archive", "Original Version Arc"],
    correctIndex: 0,
    category: "anime",
    difficulty: 2,
    explanation: "OVA stands for Original Video Animation, usually released outside regular TV broadcast.",
    tags: ["anime", "terms"],
  },
  {
    id: "fallback-history-1",
    question: "In what year did World War II end?",
    options: ["1943", "1945", "1948", "1950"],
    correctIndex: 1,
    category: "history",
    difficulty: 1,
    explanation: "World War II ended in 1945.",
    tags: ["history", "ww2"],
  },
  {
    id: "fallback-general-1",
    question: "How many continents are there on Earth?",
    options: ["5", "6", "7", "8"],
    correctIndex: 2,
    category: "general",
    difficulty: 1,
    explanation: "The commonly accepted model includes 7 continents.",
    tags: ["general", "geography"],
  },
  {
    id: "fallback-science-1",
    question: "What is the chemical symbol for water?",
    options: ["O2", "H2O", "CO2", "NaCl"],
    correctIndex: 1,
    category: "science",
    difficulty: 1,
    explanation: "Water is made of two hydrogen atoms and one oxygen atom: H2O.",
    tags: ["science", "chemistry"],
  },
  {
    id: "fallback-music-1",
    question: "How many semitones are in one octave?",
    options: ["8", "10", "12", "14"],
    correctIndex: 2,
    category: "music",
    difficulty: 2,
    explanation: "An octave contains 12 semitones in Western music theory.",
    tags: ["music", "theory"],
  },
  {
    id: "fallback-memes-1",
    question: "What does 'TL;DR' commonly mean online?",
    options: ["Too Long; Didn't Read", "Top Level; Data Report", "Text Log; Daily Record", "Time-Locked; Direct Reply"],
    correctIndex: 0,
    category: "memes",
    difficulty: 1,
    explanation: "TL;DR is shorthand for 'Too Long; Didn't Read.'",
    tags: ["memes", "internet"],
  },
  {
    id: "fallback-programming-1",
    question: "Which keyword declares an immutable variable in JavaScript?",
    options: ["var", "let", "const", "static"],
    correctIndex: 2,
    category: "programming",
    difficulty: 1,
    explanation: "`const` declares a variable binding that cannot be reassigned.",
    tags: ["programming", "javascript"],
  },
];

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
  ...fallbackQuestions,
] as const;

// Total count
export const TOTAL_QUESTIONS = ALL_QUESTIONS.length;

// Difficulty configurations
export const DIFFICULTY_CONFIG: Record<TriviaDifficulty, DifficultyConfig> = {
  1: { level: 1, name: "Very Easy", emoji: "🟢", currencyMultiplier: 1.0, xpMultiplier: 1.0, color: 0x00ff00 },
  2: { level: 2, name: "Easy", emoji: "🟩", currencyMultiplier: 1.2, xpMultiplier: 1.1, color: 0x66ff66 },
  3: { level: 3, name: "Medium", emoji: "🟡", currencyMultiplier: 1.5, xpMultiplier: 1.3, color: 0xffff00 },
  4: { level: 4, name: "Hard", emoji: "🟠", currencyMultiplier: 2.0, xpMultiplier: 1.6, color: 0xff9900 },
  5: { level: 5, name: "Expert", emoji: "🔴", currencyMultiplier: 3.0, xpMultiplier: 2.0, color: 0xff0000 },
};

// Category information
export const CATEGORY_INFO: Record<TriviaCategory, CategoryInfo> = {
  tech: { id: "tech", name: "Technology", emoji: "💻", description: "Hardware, software, and modern technology" },
  gaming: { id: "gaming", name: "Gaming", emoji: "🎮", description: "Games, consoles, and gaming culture" },
  anime: { id: "anime", name: "Anime", emoji: "🎌", description: "Anime, manga, and Japanese pop culture" },
  history: { id: "history", name: "History", emoji: "📜", description: "Historical events and key figures" },
  general: { id: "general", name: "General", emoji: "🌍", description: "General knowledge and everyday trivia" },
  science: { id: "science", name: "Science", emoji: "🔬", description: "Biology, chemistry, physics, and astronomy" },
  programming: { id: "programming", name: "Programming", emoji: "💻", description: "Code, software, and development concepts" },
  music: { id: "music", name: "Music", emoji: "🎵", description: "Music, artists, and theory" },
  memes: { id: "memes", name: "Memes", emoji: "😂", description: "Internet culture and memes" },
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
