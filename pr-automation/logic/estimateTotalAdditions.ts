import { FileChange } from '../types';

export interface AdditionsEstimate {
  additions: number;
  relevantFiles: number;
  totalFiles: number;
  estimated: boolean;
}

export function estimateTotalAdditions(
  files: FileChange[],
  totalCount: number,
  ignorePatterns: RegExp[],
): AdditionsEstimate {
  const relevantFiles = files.filter(
    file => !ignorePatterns.some(pattern => pattern.test(file.path)),
  );
  const relevantAdditions = relevantFiles.reduce(
    (sum, file) => sum + file.additions,
    0,
  );

  if (totalCount <= files.length || files.length === 0) {
    return {
      additions: relevantAdditions,
      relevantFiles: relevantFiles.length,
      totalFiles: totalCount,
      estimated: false,
    };
  }

  const relevantRatio = relevantFiles.length / files.length;
  const estimatedRelevantCount = Math.round(totalCount * relevantRatio);
  const averageRelevantAdditions =
    relevantFiles.length === 0 ? 0 : relevantAdditions / relevantFiles.length;
  const estimatedAdditions = Math.round(
    averageRelevantAdditions * estimatedRelevantCount,
  );

  return {
    additions: estimatedAdditions,
    relevantFiles: estimatedRelevantCount,
    totalFiles: totalCount,
    estimated: true,
  };
}
