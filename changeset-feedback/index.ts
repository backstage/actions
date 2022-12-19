import * as core from '@actions/core';
import * as github from '@actions/github';
import { createAppClient } from '../lib/createAppClient';
import { postFeedback } from './postFeedback';
import {
  formatSummary,
  listChangedFiles,
  listChangedPackages,
  listPackages,
  loadChangesets,
} from './generateFeedback';

async function main() {
  core.info('Running changeset feedback');

  const client = createAppClient();
  const marker = core.getInput('marker', { required: true });
  const diffRef = core.getInput('diffRef', { required: true });
  const issueNumberStr = core.getInput('issue-number', { required: true });
  const botUsername = core.getInput('botUsername', {required: true});
  const changedFiles = await listChangedFiles(diffRef);
  const packages = await listPackages();
  const changesets = await loadChangesets(changedFiles);
  const changedPackages = await listChangedPackages(changedFiles, packages);
  const repoInfo = github.context.repo;
  const feedback = formatSummary(changedPackages, changesets);

  core.info(feedback);

  await postFeedback(client, {
    ...repoInfo,
    issueNumberStr,
    marker,
    feedback,
    botUsername,
  });
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
