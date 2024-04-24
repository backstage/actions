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
  const diffRef = core.getInput('diff-ref', { required: true });
  const issueNumberStr = core.getInput('issue-number', { required: true });
  const botUsername = core.getInput('bot-username', { required: true });
  const multipleWorkspaces = core.getBooleanInput('multiple-workspaces', {
    required: false,
  });
  const changedFiles = await listChangedFiles(diffRef);
  const packages = await listPackages({ multipleWorkspaces });
  const changesets = await loadChangesets(changedFiles);
  const changedPackages = await listChangedPackages(changedFiles, packages);
  const feedback = formatSummary(changedPackages, changesets);
  const repoInfo = github.context.repo;

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
