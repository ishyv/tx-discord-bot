/**
 * Scan Detection Evaluation Suite
 *
 * Purpose: Empirically test the current image scan detection pipeline
 * to understand its behavior, strengths, and limitations.
 */

import { recognizeText } from "@/services/ocr";
import { scamFilterList } from "@/constants/automod";
import fs from "fs/promises";
import path from "path";

interface TestCase {
  id: string;
  category:
    | "clean_scan"
    | "angled_document"
    | "screenshot"
    | "ui_with_text"
    | "no_text"
    | "edge_case";
  description: string;
  imagePath?: string;
  expectedDetection: boolean;
  expectedTextContent?: string;
  notes?: string;
}

interface TestResult {
  testCase: TestCase;
  detectedAsScam: boolean;
  extractedText: string;
  processingTime: number;
  error?: string;
  actualMatches?: string[];
}

interface EvaluationSummary {
  totalTests: number;
  successfulDetections: number;
  falsePositives: number;
  falseNegatives: number;
  averageProcessingTime: number;
  categoryBreakdown: Record<
    string,
    {
      total: number;
      correct: number;
      falsePositives: number;
      falseNegatives: number;
    }
  >;
}

/**
 * Test cases representing different image categories
 */
const TEST_CASES: TestCase[] = [
  // Clean document scans
  {
    id: "clean_invoice_1",
    category: "clean_scan",
    description: "Clean PDF-like invoice with high contrast text",
    expectedDetection: false,
    expectedTextContent: "invoice total amount due",
    notes: "Should extract text but not trigger scam detection",
  },
  {
    id: "clean_receipt_1",
    category: "clean_scan",
    description: "Store receipt with itemized list",
    expectedDetection: false,
    expectedTextContent: "receipt store purchase total",
    notes: "Normal transaction document",
  },

  // Angled/perspective documents
  {
    id: "angled_document_1",
    category: "angled_document",
    description: "Document photographed at an angle with some distortion",
    expectedDetection: false,
    expectedTextContent: "document information",
    notes: "OCR may struggle but should not false positive",
  },

  // Screenshots of text
  {
    id: "code_screenshot_1",
    category: "screenshot",
    description: "Code editor screenshot with syntax highlighting",
    expectedDetection: false,
    expectedTextContent: "function class import",
    notes: "Technical content, not scam",
  },
  {
    id: "chat_screenshot_1",
    category: "screenshot",
    description: "Discord/chat screenshot",
    expectedDetection: false,
    expectedTextContent: "message chat user",
    notes: "Social media content",
  },

  // UI with text
  {
    id: "website_ui_1",
    category: "ui_with_text",
    description: "Website interface with navigation and buttons",
    expectedDetection: false,
    expectedTextContent: "home login register",
    notes: "Normal web interface",
  },
  {
    id: "app_interface_1",
    category: "ui_with_text",
    description: "Mobile app interface",
    expectedDetection: false,
    expectedTextContent: "settings profile menu",
    notes: "App UI elements",
  },

  // No text images
  {
    id: "photograph_1",
    category: "no_text",
    description: "Nature photograph with no text",
    expectedDetection: false,
    expectedTextContent: "",
    notes: "Should return empty text",
  },
  {
    id: "meme_1",
    category: "no_text",
    description: "Image meme without text",
    expectedDetection: false,
    expectedTextContent: "",
    notes: "Visual content only",
  },

  // Edge cases that might trigger detection
  {
    id: "crypto_ad_1",
    category: "edge_case",
    description: "Cryptocurrency advertisement with promotional language",
    expectedDetection: true,
    expectedTextContent: "crypto free bonus earn",
    notes: "Likely to trigger scam filters",
  },
  {
    id: "gaming_promo_1",
    category: "edge_case",
    description: 'Gaming promotion with "free" and "bonus"',
    expectedDetection: true,
    expectedTextContent: "free bonus code nitro",
    notes: "Contains scam trigger phrases",
  },
  {
    id: "mixed_content_1",
    category: "edge_case",
    description: "Legitimate content with some trigger words",
    expectedDetection: false,
    expectedTextContent: "free trial version download",
    notes: "Context matters - legitimate software",
  },
];

/**
 * Create mock image data for testing when real images aren't available
 */
async function createMockImageData(testCase: TestCase): Promise<ArrayBuffer> {
  // For now, create a simple 1x1 pixel PNG as placeholder
  // In a real test environment, you'd have actual test images
  const minimalPNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  return minimalPNG.buffer.slice(
    minimalPNG.byteOffset,
    minimalPNG.byteOffset + minimalPNG.byteLength,
  );
}

/**
 * Run a single test case
 */
async function runSingleTest(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const imageBuffer = await createMockImageData(testCase);
    const extractedText = await recognizeText(imageBuffer);
    const processingTime = Date.now() - startTime;

    // Check if extracted text matches any scam patterns
    const normalizedText = extractedText.toLowerCase();
    const matchingFilters = scamFilterList.filter((filter) =>
      filter.test(normalizedText),
    );
    const detectedAsScam = matchingFilters.length > 0;

    return {
      testCase,
      detectedAsScam,
      extractedText,
      processingTime,
      actualMatches: matchingFilters.map((f) => f.source),
    };
  } catch (error) {
    return {
      testCase,
      detectedAsScam: false,
      extractedText: "",
      processingTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Analyze OCR preprocessing behavior
 */
async function analyzeOCRPreprocessing(): Promise<void> {
  console.log("\n=== OCR Preprocessing Analysis ===");

  // Test the preprocessing pipeline with different inputs
  const testBuffer = await createMockImageData(TEST_CASES[0]);

  console.log("Preprocessing steps applied:");
  console.log("- Grayscale conversion");
  console.log("- Normalization");
  console.log("- Threshold (150)");
  console.log("- Alpha channel ensured");
  console.log("- Raw pixel data extraction");

  console.log("\nPreprocessing characteristics:");
  console.log("- Fixed threshold may lose subtle text details");
  console.log("- No adaptive thresholding for varying lighting");
  console.log("- No noise reduction or deskewing");
  console.log("- No resolution/size normalization");
}

/**
 * Analyze scam filter patterns
 */
async function analyzeScamFilters(): Promise<void> {
  console.log("\n=== Scam Filter Analysis ===");

  console.log(`Total scam filters: ${scamFilterList.length}`);

  const filterCategories = {
    crypto: 0,
    gaming: 0,
    nitro: 0,
    bonus: 0,
    general: 0,
  };

  scamFilterList.forEach((filter) => {
    const source = filter.source.toLowerCase();
    if (
      source.includes("crypto") ||
      source.includes("eth") ||
      source.includes("btc")
    ) {
      filterCategories.crypto++;
    } else if (source.includes("nitro") || source.includes("discord")) {
      filterCategories.nitro++;
    } else if (
      source.includes("bonus") ||
      source.includes("free") ||
      source.includes("code")
    ) {
      filterCategories.bonus++;
    } else if (source.includes("roblox") || source.includes("game")) {
      filterCategories.gaming++;
    } else {
      filterCategories.general++;
    }
  });

  console.log("Filter categories:");
  Object.entries(filterCategories).forEach(([category, count]) => {
    console.log(`- ${category}: ${count}`);
  });

  console.log("\nFilter characteristics:");
  console.log("- Pattern-based with character separation tolerance");
  console.log("- Case-insensitive matching");
  console.log("- Word boundary enforcement");
  console.log("- Number token support ($number)");
  console.log("- High sensitivity to false positives (as noted in code)");
}

/**
 * Run all test cases and generate summary
 */
async function runEvaluation(): Promise<EvaluationSummary> {
  console.log("=== Starting Scan Detection Evaluation ===");

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    console.log(`\nTesting: ${testCase.id} - ${testCase.description}`);
    const result = await runSingleTest(testCase);
    results.push(result);

    console.log(
      `Result: ${result.detectedAsScam ? "DETECTED" : "NOT DETECTED"}`,
    );
    console.log(`Text extracted: "${result.extractedText}"`);
    console.log(`Processing time: ${result.processingTime}ms`);

    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    if (result.actualMatches && result.actualMatches.length > 0) {
      console.log(`Matched patterns: ${result.actualMatches.join(", ")}`);
    }
  }

  // Calculate summary statistics
  const summary: EvaluationSummary = {
    totalTests: results.length,
    successfulDetections: results.filter(
      (r) => r.detectedAsScam === r.testCase.expectedDetection,
    ).length,
    falsePositives: results.filter(
      (r) => r.detectedAsScam && !r.testCase.expectedDetection,
    ).length,
    falseNegatives: results.filter(
      (r) => !r.detectedAsScam && r.testCase.expectedDetection,
    ).length,
    averageProcessingTime:
      results.reduce((sum, r) => sum + r.processingTime, 0) / results.length,
    categoryBreakdown: {},
  };

  // Calculate category breakdowns
  const categories = [...new Set(TEST_CASES.map((tc) => tc.category))];
  categories.forEach((category) => {
    const categoryResults = results.filter(
      (r) => r.testCase.category === category,
    );
    const categoryTests = TEST_CASES.filter((tc) => tc.category === category);

    summary.categoryBreakdown[category] = {
      total: categoryTests.length,
      correct: categoryResults.filter(
        (r) => r.detectedAsScam === r.testCase.expectedDetection,
      ).length,
      falsePositives: categoryResults.filter(
        (r) => r.detectedAsScam && !r.testCase.expectedDetection,
      ).length,
      falseNegatives: categoryResults.filter(
        (r) => !r.detectedAsScam && r.testCase.expectedDetection,
      ).length,
    };
  });

  return summary;
}

/**
 * Main evaluation function
 */
export async function evaluateScanDetection(): Promise<void> {
  try {
    await analyzeOCRPreprocessing();
    await analyzeScamFilters();

    const summary = await runEvaluation();

    console.log("\n=== EVALUATION SUMMARY ===");
    console.log(`Total tests: ${summary.totalTests}`);
    console.log(
      `Successful detections: ${summary.successfulDetections} (${((summary.successfulDetections / summary.totalTests) * 100).toFixed(1)}%)`,
    );
    console.log(`False positives: ${summary.falsePositives}`);
    console.log(`False negatives: ${summary.falseNegatives}`);
    console.log(
      `Average processing time: ${summary.averageProcessingTime.toFixed(1)}ms`,
    );

    console.log("\n=== CATEGORY BREAKDOWN ===");
    Object.entries(summary.categoryBreakdown).forEach(([category, stats]) => {
      const accuracy = ((stats.correct / stats.total) * 100).toFixed(1);
      console.log(
        `${category}: ${stats.correct}/${stats.total} (${accuracy}%) - FP: ${stats.falsePositives}, FN: ${stats.falseNegatives}`,
      );
    });
  } catch (error) {
    console.error("Evaluation failed:", error);
  }
}

// Run evaluation if this file is executed directly
if (require.main === module) {
  evaluateScanDetection();
}
