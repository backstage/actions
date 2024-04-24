// import * as core from '@actions/core';
// import * as github from '@actions/github';
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
  // core.info('Running changeset feedback');

  // const client = createAppClient();
  // const marker = core.getInput('marker', { required: true });
  // const diffRef = core.getInput('diff-ref', { required: true });
  const diffRef = 'origin/main';
  // const issueNumberStr = core.getInput('issue-number', { required: true });
  // const botUsername = core.getInput('bot-username', {required: true});
  const changedFiles = await listChangedFiles(diffRef);

  console.log({ changedFiles });
  const packages = await listPackages({ isCommunityPluginsRepo: true });
  console.log({ packages });
  const changesets = await loadChangesets(changedFiles);
  console.log({ changesets });
  const changedPackages = await listChangedPackages(changedFiles, packages);
  console.log({ changedPackages });
  // const repoInfo = github.context.repo;
  const feedback = formatSummary(changedPackages, changesets);
  console.log({ feedback });

  // core.info(feedback);

  // await postFeedback(client, {
  //   ...repoInfo,
  //   issueNumberStr,
  //   marker,
  //   feedback,
  //   botUsername,
  // });
}

main().catch(error => {
  // core.error(error.stack);
  // core.setFailed(String(error));
  console.log(error);
  process.exit(1);
});
