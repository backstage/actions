import { estimateTotalAdditions } from './estimateTotalAdditions';

describe('estimateTotalAdditions', () => {
  it('counts additions and filters ignored files', () => {
    const allLoaded = estimateTotalAdditions(
      [
        { path: 'src/index.ts', additions: 10 },
        { path: 'src/utils.ts', additions: 20 },
      ],
      2,
      [],
    );
    const withIgnored = estimateTotalAdditions(
      [
        { path: 'src/index.ts', additions: 10 },
        { path: 'yarn.lock', additions: 100 },
      ],
      2,
      [/yarn\.lock$/],
    );
    const allIgnored = estimateTotalAdditions(
      [
        { path: 'yarn.lock', additions: 100 },
        { path: 'package-lock.json', additions: 200 },
      ],
      2,
      [/yarn\.lock$/, /package-lock\.json$/],
    );
    const multiplePatterns = estimateTotalAdditions(
      [
        { path: 'src/index.ts', additions: 10 },
        { path: 'yarn.lock', additions: 100 },
        { path: 'package-lock.json', additions: 200 },
      ],
      3,
      [/yarn\.lock$/, /package-lock\.json$/],
    );

    expect(allLoaded.estimated).toBe(false);
    expect(allLoaded.additions).toBe(30);
    expect(allLoaded.relevantFiles).toBe(2);
    expect(allLoaded.totalFiles).toBe(2);
    expect(withIgnored.estimated).toBe(false);
    expect(withIgnored.additions).toBe(10);
    expect(withIgnored.relevantFiles).toBe(1);
    expect(allIgnored.estimated).toBe(false);
    expect(allIgnored.additions).toBe(0);
    expect(allIgnored.relevantFiles).toBe(0);
    expect(multiplePatterns.estimated).toBe(false);
    expect(multiplePatterns.additions).toBe(10);
    expect(multiplePatterns.relevantFiles).toBe(1);
  });

  it('estimates additions when pagination truncates', () => {
    const estimate = estimateTotalAdditions(
      [
        { path: 'src/index.ts', additions: 10 },
        { path: 'yarn.lock', additions: 100 },
      ],
      4,
      [/yarn\.lock$/],
    );
    const estimateWithMoreFiles = estimateTotalAdditions(
      [
        { path: 'src/file1.ts', additions: 20 },
        { path: 'src/file2.ts', additions: 30 },
        { path: 'yarn.lock', additions: 100 },
      ],
      10,
      [/yarn\.lock$/],
    );

    expect(estimate.estimated).toBe(true);
    expect(estimate.additions).toBe(20);
    expect(estimate.relevantFiles).toBe(2);
    expect(estimate.totalFiles).toBe(4);
    expect(estimateWithMoreFiles.estimated).toBe(true);
    expect(estimateWithMoreFiles.relevantFiles).toBeGreaterThan(2);
    expect(estimateWithMoreFiles.totalFiles).toBe(10);
  });

  it('handles empty file list', () => {
    const estimate = estimateTotalAdditions([], 0, []);

    expect(estimate.estimated).toBe(false);
    expect(estimate.additions).toBe(0);
    expect(estimate.relevantFiles).toBe(0);
    expect(estimate.totalFiles).toBe(0);
  });
});
