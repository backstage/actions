import { CheckRun } from '../types';

export interface RequiredChecksStatus {
  /** Priority multiplier based on check status (1 if passing, 0.5 if not) */
  multiplier: number;
  /** Names of checks that completed with non-success conclusion */
  failingChecks: string[];
  /** Names of checks that haven't completed yet */
  pendingChecks: string[];
}

/**
 * Evaluates the status of required checks and returns the priority multiplier.
 * Returns multiplier of 1 if all required checks are passing or if no required
 * checks are configured/found. Returns 0.5 if any required checks are failing
 * or pending.
 */
export function getRequiredChecksStatus(
  checkRuns: CheckRun[],
  requiredCheckNames: string[],
): RequiredChecksStatus {
  if (requiredCheckNames.length === 0) {
    return { multiplier: 1, failingChecks: [], pendingChecks: [] };
  }

  const requiredChecks = checkRuns.filter(run =>
    requiredCheckNames.includes(run.name),
  );

  if (requiredChecks.length === 0) {
    return { multiplier: 1, failingChecks: [], pendingChecks: [] };
  }

  const failingChecks = requiredChecks
    .filter(run => run.status === 'COMPLETED' && run.conclusion !== 'SUCCESS')
    .map(run => run.name);

  const pendingChecks = requiredChecks
    .filter(run => run.status !== 'COMPLETED')
    .map(run => run.name);

  const isPassing = failingChecks.length === 0 && pendingChecks.length === 0;

  return {
    multiplier: isPassing ? 1 : 0.5,
    failingChecks,
    pendingChecks,
  };
}
