import * as core from '@actions/core';
import * as github from '@actions/github';
import { Repository } from '@octokit/graphql-schema';
import { Codeowners } from 'codeowners';

async function getRepoEvents(options: {
  github: ReturnType<typeof github.getOctokit>;
  context: { owner: string; repo: string };
  pull_number: number;
}) {
  const { github, context, pull_number } = options;

  const commits = await github.paginate(github.rest.pulls.listCommits, {
    owner: context.owner,
    repo: context.repo,
    pull_number,
  });

  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    owner: context.owner,
    repo: context.repo,
    pull_number,
  });

  const pullComments = await github.paginate(
    'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
    {
      owner: context.owner,
      repo: context.repo,
      pull_number,
    },
  );

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner: context.owner,
    repo: context.repo,
    issue_number: pull_number,
  });

  const events = [
    ...reviews.map(({ user, submitted_at }) => ({
      user,
      updated_at: submitted_at,
      type: 'review',
    })),
    ...commits.map(({ commit, author, committer }) => ({
      user: author || committer,
      updated_at: commit.author?.date || commit.committer?.date,
      type: 'commit',
    })),
    ...pullComments.map(({ user, updated_at }) => ({
      user,
      updated_at,
      type: 'pr_comment',
    })),
    ...comments.map(({ user, updated_at }) => ({
      user,
      updated_at,
      type: 'pr_comment',
    })),
  ];

  return events
    .sort(
      (a, b) =>
        new Date(a.updated_at ?? 0).getTime() -
        new Date(b.updated_at ?? 0).getTime(),
    )
    .filter(({ user }) => (user ? !user.login.includes('[bot]') : false));
}

export async function goalieLabels(
  client: ReturnType<typeof github.getOctokit>,
  options: { owner: string; repo: string },
) {
  const { owner, repo } = options;

  // first get all open pull requests
  const allPullRequests = await client.paginate(client.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
  });

  const { data: teams } = await client.request('GET /orgs/{org}/teams', {
    org: owner,
  });

  const groupMembers = await Promise.all(
    teams.map(async team => {
      const { data } = await client.rest.teams.listMembersInOrg({
        org: owner,
        team_slug: team.slug,
      });

      return { team: `@backstage/${team.slug}`, data };
    }),
  );

  const codeowners = new Codeowners();

  for (const pullRequest of allPullRequests) {
    // Go through each file changed and get the codeowners for that file.
    // Find the group in the group list that matches the codeowner.
    // If it does match push the owner to a list of reviewers
    // check to see the reviews and if there is at least one matching reviewer from those group

    const changedFiles = await client.paginate(client.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pullRequest.number,
    });

    const allReviews = await client.paginate(client.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: pullRequest.number,
    });

    const expectedReviewers = new Set();

    for (const file of changedFiles) {
      expectedReviewers.add(...codeowners.getOwner(file.filename));
    }

    const hasReviewed = new Set<string>();

    // For each reviewer in the group, check to see if they have a review set
    for (const reviewer of expectedReviewers) {
      const members = groupMembers.find(member => member.team === reviewer);
      if (members) {
        // then we are dealing with a group
        const hasMemberReview = allReviews.some(review =>
          members.data.some(member => member.login === review.user.login),
        );
        if (hasMemberReview) {
          hasReviewed.add(reviewer);
        }
      } else {
        // reviewer is a person
        const hasReview = allReviews.some(
          review => reviewer === `@${review.user.login}`,
        );
        if (hasReview) {
          hasReviewed.add(reviewer);
        }
      }
    }

    // if all required reviewers have reviewed
    if (hasReviewed.size === expectedReviewers.size) {
      const repoEvents = await getRepoEvents({
        github: client,
        context: { owner, repo },
        pull_number: pullRequest.number,
      });
      // if the last event for the issue is not by the author, remove the label
      if (
        repoEvents[repoEvents.length - 1].user.login !== pullRequest.user.login
      ) {
        await github.rest.issues
          .removeLabel({
            issue_number: pullRequest.number,
            owner,
            repo,
            name: 'awaiting-review',
          })
          .catch(e => {
            console.error(e);
          });
      }
      // add the awaiting-review label to tell us that the PR is waiting on reviews
    } else {
      await client.rest.issues
        .addLabels({
          issue_number: pullRequest.number,
          owner,
          repo,
          labels: ['awaiting-review'],
        })
        .catch(e => {
          console.error(e);
        });
    }
  }
}
