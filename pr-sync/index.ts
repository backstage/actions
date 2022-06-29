import * as core from '@actions/core';
import * as github from '@actions/github';
import { approveRenovatePRs } from './approveRenovatePRs';

async function main() {
  console.log(`Running pr-sync!`);
  const token = core.getInput('github-token', { required: true });
  const client = github.getOctokit(token);
  const repoInfo = github.context.repo;

  await Promise.all([
    approveRenovatePRs(client, {
      ...repoInfo,
      issueNumber: github.context.issue.number,
      actor: github.context.actor,
    }),
  ]);
}

main().catch(error => {
  console.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
