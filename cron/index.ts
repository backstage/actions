import * as core from '@actions/core';
import * as github from '@actions/github';
import { verifyDCO } from './verifyDCO';
import { mergeDependencyPRs } from './mergeDependencyPRs';
import { mkLog } from '../lib/mkLog';
import { createAppClient } from '../lib/createAppClient';

async function main() {
  core.info(`Running cron!`);

  const client = createAppClient();
  const mergeToken = core.getInput('merge-token');
  const mergeClient = mergeToken ? github.getOctokit(mergeToken) : client;

  const repoInfo = github.context.repo;

  await Promise.all([
    verifyDCO(client, repoInfo, mkLog('verify-dco')),
    mergeDependencyPRs(
      client,
      repoInfo,
      mkLog('merge-dependency-prs'),
      undefined,
      mergeClient,
    ),
  ]);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
