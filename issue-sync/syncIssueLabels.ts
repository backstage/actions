import * as core from '@actions/core';
import * as github from '@actions/github';
import { Repository } from '@octokit/graphql-schema';

export async function syncIssueLabels(
  client: ReturnType<typeof github.getOctokit>,
  options: {
    owner: string;
    repo: string;
    issueNumber: number;
    issueTitle?: string;
  },
  log = core.info,
  waitTimeMs = 2000,
) {
  const { owner, repo, issueNumber, issueTitle } = options;

  if (!issueTitle) {
    log(`No issue title for ${owner}/${repo}#${issueNumber}`);
    return;
  }

  const keywords = {
    'techdocs|tech-docs|tech docs': 'techdocs',
    search: 'search',
    catalog: 'catalog',
    scaffolder: 'scaffolder',
    permission: 'area:permissions',
  };

  const labels = Object.entries(keywords)
    .map(([regexp, label]) => {
      if (new RegExp(regexp, 'gi').test(issueTitle)) {
        return label;
      }
    })
    .filter((label): label is string => label !== undefined);

  if (!labels.length) {
    return;
  }

  client.rest.issues.addLabels({
    issue_number: issueNumber,
    owner: owner,
    repo: repo,
    labels,
  });
}
