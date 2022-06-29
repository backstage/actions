import * as core from '@actions/core';
import * as github from '@actions/github';
import { verifyDCO } from './verifyDCO';
import { mergeRenovatePRs } from './mergeRenovatePRs';
import { mkLog } from '../lib/mkLog';

async function main() {
  core.info(`Running cron!`);
  const token = core.getInput('github-token', { required: true });
  const client = github.getOctokit(token);
  const repoInfo = github.context.repo;

  await Promise.all([
    verifyDCO(client, repoInfo, mkLog('verify-dco')),
    mergeRenovatePRs(client, repoInfo, mkLog('merge-renovate-prs')),
  ]);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
