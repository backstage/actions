import * as core from '@actions/core';
import * as github from '@actions/github';
import { maybeSetReReviewStatus } from '../lib/board';
import { createAppClient } from '../lib/createAppClient';

async function main() {
  core.info(`Running re-review!`);

  const client = createAppClient();
  const projectId = core.getInput('project-id', { required: true });
  const issueNumberStr = core.getInput('issue-number', { required: true });

  const issueNumber = parseInt(issueNumberStr, 10);
  if (Number.isNaN(issueNumber)) {
    throw new Error(`Invalid issue number: ${issueNumberStr}`);
  }

  const repoInfo = github.context.repo;

  await maybeSetReReviewStatus(client, {
    ...repoInfo,
    projectId,
    issueNumber,
  });
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
