/**
 * Scan Detection Analysis - System Behavior Evaluation
 *
 * This analysis focuses on understanding the current scan detection pipeline
 * without requiring actual image files, by analyzing the code and logic.
 */

import { scamFilterList } from "@/constants/automod";

interface SystemAnalysis {
  triggerConditions: string[];
  detectionLogic: "rule-based" | "ml-based" | "hybrid";
  preprocessingSteps: string[];
  failurePoints: string[];
  downstreamImpacts: string[];
}

interface FilterAnalysis {
  totalFilters: number;
  categories: Record<string, number>;
  sensitivityLevel: "high" | "medium" | "low";
  commonTriggers: string[];
  falsePositiveRisks: string[];
}

/**
 * Analyze how scan detection is triggered in auto mode
 */
function analyzeTriggerConditions(): string[] {
  return [
    "1. Message Event Trigger:",
    "   - AutoMod listener fires on every message from non-bot users",
    "   - Checks if AutoMod feature is enabled for the guild",
    "   - Calls AutoModSystem.analyzeUserMessage()",
    "",
    "2. Attachment Analysis:",
    "   - shouldScanAttachments() checks if message has image attachments",
    '   - Only processes attachments with contentType starting with "image/"',
    "   - Skips non-image attachments entirely",
    "",
    "3. Image Processing Pipeline:",
    "   - Downloads image buffer (max 8MB, 15s timeout)",
    "   - Calculates perceptual hash for caching",
    '   - Checks cache for previous "unsafe" results',
    "   - If not cached, proceeds to OCR analysis",
    "",
    "4. OCR + Scam Detection:",
    "   - Calls recognizeText() with image buffer",
    "   - Text is normalized to lowercase",
    "   - Checked against scamFilterList regex patterns",
    "   - If any pattern matches, image is flagged as suspicious",
  ];
}

/**
 * Analyze the detection logic type
 */
function analyzeDetectionLogic(): "rule-based" | "ml-based" | "hybrid" {
  // Based on code analysis:
  // - OCR uses ML (PaddleOCR) for text extraction
  // - Scam detection uses rule-based regex patterns
  // - No ML-based classification of "scan vs not scan"
  // - System only cares if text contains scam patterns
  return "hybrid";
}

/**
 * Analyze OCR preprocessing steps
 */
function analyzePreprocessingSteps(): string[] {
  return [
    "1. Sharp Image Processing:",
    "   - Converts to grayscale",
    "   - Applies normalization (contrast adjustment)",
    "   - Applies fixed threshold of 150",
    "   - Ensures alpha channel presence",
    "   - Converts to raw pixel buffer",
    "",
    "2. PaddleOCR Processing:",
    "   - Uses PP-OCRv5 mobile detection model",
    "   - Uses PP-OCRv5 mobile recognition model",
    "   - Processes text through character dictionary",
    "   - Returns recognized text strings",
  ];
}

/**
 * Identify potential failure points
 */
function analyzeFailurePoints(): string[] {
  return [
    "1. OCR Failures:",
    "   - Fixed threshold (150) may fail on varied lighting",
    "   - No adaptive thresholding for different contrast levels",
    "   - No noise reduction for low-quality images",
    "   - No deskewing for angled documents",
    "   - Handwriting likely fails (trained on printed text)",
    "",
    "2. Image Processing Issues:",
    "   - Large images (>8MB) are rejected",
    "   - Slow downloads timeout after 15s",
    "   - Corrupted images cause processing failures",
    "   - Some image formats may not be supported",
    "",
    "3. Filter Limitations:",
    "   - Regex patterns are literal and can be evaded",
    "   - Character separation tolerance may create false positives",
    "   - No context understanding of word usage",
    "   - Pattern matching is case-insensitive but not context-aware",
    "",
    "4. System Issues:",
    "   - OCR service can become unavailable",
    "   - Cache may store false results for 1 week",
    "   - No retry mechanism for failed OCR attempts",
  ];
}

/**
 * Analyze downstream impacts of scan detection
 */
function analyzeDownstreamImpacts(): string[] {
  return [
    "1. When Suspicious Image is Detected:",
    '   - Image hash is cached as "unsafe" for 1 week',
    "   - Staff notification is sent to staff channel",
    "   - Message is NOT automatically deleted",
    "   - User is NOT automatically timed out",
    "   - No public warning is shown to users",
    "",
    "2. Staff Notification Content:",
    "   - Shows warning message with image URL",
    "   - Includes message URL for context",
    "   - Sent to guild-configured staff channel",
    "   - If staff channel is invalid, error is logged",
    "",
    "3. Cache Behavior:",
    "   - Perceptual hash used as cache key",
    '   - "unsafe" results cached for 7 days',
    "   - Cache persists across bot restarts",
    "   - No manual cache invalidation mechanism",
    "",
    "4. False Positive Impact:",
    "   - Legitimate images marked as suspicious",
    "   - Staff may receive unnecessary notifications",
    "   - User experience not directly affected",
    "   - No appeal mechanism for false detections",
  ];
}

/**
 * Analyze scam filter patterns
 */
function analyzeScamFilters(): FilterAnalysis {
  const categories: Record<string, number> = {
    cryptocurrency: 0,
    gaming: 0,
    discord_nitro: 0,
    free_bonus: 0,
    suspicious_domains: 0,
    adult_content: 0,
    general_spam: 0,
  };

  const commonTriggers: string[] = [];
  const falsePositiveRisks: string[] = [];

  scamFilterList.forEach((filter) => {
    const source = filter.source.toLowerCase();

    // Categorize filters
    if (
      source.includes("crypto") ||
      source.includes("eth") ||
      source.includes("btc")
    ) {
      categories.cryptocurrency++;
    } else if (
      source.includes("roblox") ||
      source.includes("solara") ||
      source.includes("executor")
    ) {
      categories.gaming++;
    } else if (source.includes("nitro") || source.includes("discord")) {
      categories.discord_nitro++;
    } else if (
      source.includes("free") ||
      source.includes("bonus") ||
      source.includes("code")
    ) {
      categories.free_bonus++;
    } else if (
      source.includes(".xyz") ||
      source.includes(".click") ||
      source.includes(".info")
    ) {
      categories.suspicious_domains++;
    } else if (source.includes("pornhub") || source.includes("xvideos")) {
      categories.adult_content++;
    } else {
      categories.general_spam++;
    }

    // Identify common trigger words
    if (source.includes("free")) commonTriggers.push("free");
    if (source.includes("bonus")) commonTriggers.push("bonus");
    if (source.includes("nitro")) commonTriggers.push("nitro");
    if (source.includes("crypto")) commonTriggers.push("crypto");
    if (source.includes("discord.gg")) commonTriggers.push("discord.gg");
  });

  // Identify false positive risks
  falsePositiveRisks.push(
    'Legitimate giveaways using "free" and "bonus"',
    "Crypto discussions in trading communities",
    "Gaming communities discussing Roblox",
    "Discord server sharing (non-spam)",
    'Software promotions with "free trial"',
    "Legitimate cryptocurrency projects",
  );

  return {
    totalFilters: scamFilterList.length,
    categories,
    sensitivityLevel: "high", // Noted in code comments
    commonTriggers: [...new Set(commonTriggers)],
    falsePositiveRisks,
  };
}

/**
 * Generate comprehensive system analysis
 */
function generateSystemAnalysis(): SystemAnalysis {
  return {
    triggerConditions: analyzeTriggerConditions(),
    detectionLogic: analyzeDetectionLogic(),
    preprocessingSteps: analyzePreprocessingSteps(),
    failurePoints: analyzeFailurePoints(),
    downstreamImpacts: analyzeDownstreamImpacts(),
  };
}

/**
 * Create test scenarios for empirical testing
 */
function createTestScenarios() {
  return {
    successfulDetection: [
      'Images with "free nitro" text',
      "Crypto scam advertisements",
      "Roblox executor promotions",
      "Discord invite spam",
      "Adult content links",
    ],
    likelyFalsePositives: [
      "Legitimate software giveaways",
      "Crypto education content",
      "Gaming community discussions",
      "Server sharing in appropriate contexts",
      "Free trial promotions",
    ],
    likelyFalseNegatives: [
      "Handwritten scam messages",
      "Images with obfuscated text",
      "Scams using uncommon trigger words",
      "Visual-only scams (no text)",
      "Images with poor OCR quality",
    ],
    edgeCases: [
      "Mixed legitimate/scam content",
      "Scams in non-Latin characters",
      "Images with partial trigger words",
      "Legitimate content near scam patterns",
      "Memes about scams",
    ],
  };
}

/**
 * Main analysis function
 */
export function performScanDetectionAnalysis(): void {
  console.log("=== SCAN DETECTION SYSTEM ANALYSIS ===\n");

  const systemAnalysis = generateSystemAnalysis();
  const filterAnalysis = analyzeScamFilters();
  const testScenarios = createTestScenarios();

  // System Overview
  console.log("SYSTEM OVERVIEW:");
  console.log("Detection Logic:", systemAnalysis.detectionLogic);
  console.log("This is a HYBRID system:");
  console.log("- ML-based OCR (PaddleOCR) for text extraction");
  console.log("- Rule-based regex patterns for scam detection");
  console.log('- NO actual "scan detection" - only scam text detection\n');

  // Trigger Conditions
  console.log("TRIGGER CONDITIONS:");
  systemAnalysis.triggerConditions.forEach((condition) =>
    console.log(condition),
  );
  console.log("");

  // Preprocessing Analysis
  console.log("PREPROCESSING STEPS:");
  systemAnalysis.preprocessingSteps.forEach((step) => console.log(step));
  console.log("");

  // Filter Analysis
  console.log("SCAM FILTER ANALYSIS:");
  console.log(`Total filters: ${filterAnalysis.totalFilters}`);
  console.log(`Sensitivity level: ${filterAnalysis.sensitivityLevel}`);
  console.log("\nFilter categories:");
  Object.entries(filterAnalysis.categories).forEach(([category, count]) => {
    if (count > 0) console.log(`  ${category}: ${count}`);
  });
  console.log(
    "\nCommon trigger words:",
    filterAnalysis.commonTriggers.join(", "),
  );
  console.log("\nFalse positive risks:");
  filterAnalysis.falsePositiveRisks.forEach((risk) =>
    console.log(`  - ${risk}`),
  );
  console.log("");

  // Failure Points
  console.log("FAILURE POINTS:");
  systemAnalysis.failurePoints.forEach((point) => console.log(point));
  console.log("");

  // Downstream Impacts
  console.log("DOWNSTREAM IMPACTS:");
  systemAnalysis.downstreamImpacts.forEach((impact) => console.log(impact));
  console.log("");

  // Test Scenarios
  console.log("RECOMMENDED TEST SCENARIOS:");
  console.log("\nShould be detected:");
  testScenarios.successfulDetection.forEach((scenario) =>
    console.log(`  ✓ ${scenario}`),
  );
  console.log("\nMay be false positives:");
  testScenarios.likelyFalsePositives.forEach((scenario) =>
    console.log(`  ⚠ ${scenario}`),
  );
  console.log("\nMay be false negatives:");
  testScenarios.likelyFalseNegatives.forEach((scenario) =>
    console.log(`  ✗ ${scenario}`),
  );
  console.log("\nEdge cases to test:");
  testScenarios.edgeCases.forEach((scenario) => console.log(`  ? ${scenario}`));
  console.log("");

  // Key Findings
  console.log("KEY FINDINGS:");
  console.log('1. NO "scan detection" - only text-based scam detection');
  console.log("2. OCR quality heavily impacts detection accuracy");
  console.log("3. Fixed preprocessing threshold limits performance");
  console.log("4. High sensitivity to false positives (noted in code)");
  console.log("5. No ML-based image classification or scan detection");
  console.log("6. Caching prevents re-evaluation for 7 days");
  console.log("7. System only notifies staff, does not auto-moderate");
  console.log("8. Limited to text content - visual scams missed");
  console.log("");
}

// Run analysis if this file is executed directly
if (require.main === module) {
  performScanDetectionAnalysis();
}
