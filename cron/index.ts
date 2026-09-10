import * as core from '@actions/core';
import * as github from '@actions/github';
import { verifyDCO } from './verifyDCO';
import { mergeDependencyPRs } from './mergeDependencyPRs';
import { mkLog } from '../lib/mkLog';
import { createAppClient } from '../lib/createAppClient';

async function main() {
  core.info(`Running cron!`);

  const client = createAppClient();

  const repoInfo = github.context.repo;

  await Promise.all([
    verifyDCO(client, repoInfo, mkLog('verify-dco')),
    mergeDependencyPRs(client, repoInfo, mkLog('merge-dependency-prs')),
  ]);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
