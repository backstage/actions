import * as core from '@actions/core';
import * as github from '@actions/github';
import { createAppClient } from '../lib/createAppClient';
import {postFeedback} from "./postFeedback";

async function main() {
  core.info('Running changeset feedback');

  const client = createAppClient();
  const marker = core.getInput('marker', { required: true });
  const feedback = require('fs').readFileSync('feedback.txt', 'utf8');
  const issueNumberStr = core.getInput('issue-number', { required: true });

  const repoInfo = github.context.repo;

  await postFeedback(client, {
    ...repoInfo,
    issueNumberStr,
  }, marker, feedback);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
