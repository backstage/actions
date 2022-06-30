import * as core from '@actions/core';
import * as github from '@actions/github';

export async function verifyDCO(
  client: ReturnType<typeof github.getOctokit>,
  repoInfo: { owner: string; repo: string },
  log = core.info,
) {
  const { owner, repo } = repoInfo;

  const pulls = await client.paginate(client.rest.pulls.list, {
    state: 'open',
    owner,
    repo,
  });

  for (const pull of pulls) {
    // Pick out the PRs that have the DCO check
    const checks = await client.rest.checks.listForRef({
      owner,
      repo,
      ref: pull.head.sha,
      check_name: 'DCO',
      status: 'completed',
    });
    // Skip if there are no checks
    if (!checks.data.check_runs.length) {
      continue;
    }
    // Skip if the conclusion is not action_required
    if (checks.data.check_runs[0].conclusion !== 'action_required') {
      log(`No checks found for PR #${pull.number}, skipping`);
      continue;
    }
    const comments = await client.paginate(client.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pull.number,
    });
    if (comments.find(c => c.body?.includes('<!-- dco -->'))) {
      log(`Already commented on PR #${pull.number}, skipping`);
      continue;
    }
    log(`Creating comment on PR #${pull.number}`);
    const body = `
Thanks for the contribution!
All commits need to be DCO signed before they are reviewed. Please refer to the the [DCO section in CONTRIBUTING.md](https://github.com/backstage/backstage/blob/master/CONTRIBUTING.md#developer-certificate-of-origin) or the [DCO](${checks.data.check_runs[0].html_url}) status for more info.
<!-- dco -->`;
    await client.rest.issues.createComment({
      repo,
      owner,
      issue_number: pull.number,
      body,
    });
  }
}
