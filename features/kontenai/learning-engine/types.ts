/**
 * Local types for Sprint 8 - Learning Engine. Extra shapes that sit on top
 * of the shared `LearningRecord` contract (features/kontenai/types.ts)
 * without needing to edit that shared file.
 */

/** One recurring theme extracted from many LearningRecords, with a frequency count. */
export interface LearningTheme {
  phrase: string;
  count: number;
}

/**
 * Aggregated stats over all LearningRecords -- the shape Sprint 9 (AI
 * Optimization) is expected to consume down the line.
 */
export interface LearningSummary {
  totalRecords: number;
  averageScore: number;
  approvalRate: number;
  topWhatWorked: LearningTheme[];
  topWhatToImprove: LearningTheme[];
}
