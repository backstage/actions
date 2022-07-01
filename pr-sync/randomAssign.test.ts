import { describe, it, expect, jest } from '@jest/globals';
import { getOctokit } from '@actions/github';
import { randomAssign, REVIEWERS } from './randomAssign';

type Octokit = ReturnType<typeof getOctokit>;

const mockClient = {
  rest: {
    issues: {
      addAssignees: jest.fn<Octokit['rest']['issues']['addAssignees']>(),
    },
  },
};
const client = mockClient as unknown as Octokit;
const ctx = {
  owner: 'le-owner',
  repo: 'le-repo',
  issueNumber: 1,
  excludedUsers: '',
  action: 'opened',
  author: 'le-actor',
};
const log = jest.fn();

describe('randomAssign', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should randomly assign a reviewer', async () => {
    await randomAssign(client, ctx, log);
    expect(mockClient.rest.issues.addAssignees).toHaveBeenCalledWith({
      owner: 'le-owner',
      repo: 'le-repo',
      issue_number: 1,
      assignees: [
        expect.stringMatching(new RegExp(`^${REVIEWERS.join('|')}$`)),
      ],
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Assigning #1 by @le-actor to @'),
    );
  });

  it('should not assign to an excluded user', async () => {
    await randomAssign(
      client,
      { ...ctx, excludedUsers: REVIEWERS.slice(1).join(',') },
      log,
    );
    expect(mockClient.rest.issues.addAssignees).toHaveBeenCalledWith({
      owner: 'le-owner',
      repo: 'le-repo',
      issue_number: 1,
      assignees: [REVIEWERS[0]],
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Assigning #1 by @le-actor to @'),
    );
  });

  it('should not assign to the author', async () => {
    await randomAssign(
      client,
      {
        ...ctx,
        author: 'Rugvip',
        excludedUsers: REVIEWERS.slice(2).join(','),
      },
      log,
    );
    expect(mockClient.rest.issues.addAssignees).toHaveBeenCalledWith({
      owner: 'le-owner',
      repo: 'le-repo',
      issue_number: 1,
      assignees: [REVIEWERS[0]],
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Assigning #1 by @Rugvip to @jhaals'),
    );
  });

  it('should skip non open|reopen events', async () => {
    await randomAssign(client, { ...ctx, action: 'closed' }, log);
    expect(log).toHaveBeenCalledWith('Skipping assignment for closed action');
  });
});
