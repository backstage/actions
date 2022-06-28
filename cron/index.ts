import * as core from '@actions/core';
import * as github from '@actions/github';
import { verifyDCO } from './verifyDCO';
import { mergeRenovatePRs } from './mergeRenovatePRs';

async function main() {
  console.log(`Running cron!`);
  const token = core.getInput('github-token', { required: true });
  const client = github.getOctokit(token);
  const repoInfo = github.context.repo;

  await Promise.all([
    verifyDCO(client, repoInfo),
    mergeRenovatePRs(client, repoInfo),
  ]);
}

main().catch(error => {
  console.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
