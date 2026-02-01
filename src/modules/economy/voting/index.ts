/**
 * Social Voting Module.
 *
 * Purpose: Love/hate voting system with safety constraints.
 */

export * from "./types";
export {
  DEFAULT_VOTING_CONFIG,
  checkBadgeEligibility,
  getEligibleBadges,
  formatVoteCounts,
  calculateLoveRatio,
} from "./config";
export { votingRepo, type VotingRepo } from "./repository";
export { votingService, type VotingService } from "./service";
