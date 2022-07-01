import { describe, it, expect, jest } from '@jest/globals';
import { getOctokit } from '@actions/github';
import { syncProjectBoard } from './syncProjectBoard';

type Octokit = ReturnType<typeof getOctokit>;

const mockClient = {
  graphql: jest.fn<Octokit['graphql']>(),
};
const client = mockClient as unknown as Octokit;
const ctx = {
  owner: 'le-owner',
  repo: 'le-repo',
  issueNumber: 1,
  projectId: 'p2',
};
const log = jest.fn();

describe('syncProjectBoard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should do nothing if action is undefined', async () => {
    await syncProjectBoard(client, { ...ctx }, log);
    expect(log).not.toBeCalled();
  });

  it('should add new issues to the board when opened', async () => {
    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          id: 'pr-id',
        },
      },
    });

    mockClient.graphql.mockResolvedValueOnce({
      deleteProjectV2Item: {
        deletedItemId: 'deleted-item-id',
      },
    });
    await syncProjectBoard(client, { ...ctx, action: 'opened' }, log);
    expect(mockClient.graphql).toHaveBeenCalledWith(expect.any(String), {
      projectId: 'p2',
      contentId: 'pr-id',
    });
    expect(log).toHaveBeenCalledWith('Adding PR 1 to board p2');
  });

  it('should fail to add to board if PR is not found', async () => {
    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequest: null,
      },
    });

    await expect(
      syncProjectBoard(client, { ...ctx, action: 'reopened' }, log),
    ).rejects.toThrow('Failed to look up PR ID for #1');
    expect(log).toHaveBeenCalledWith('Adding PR 1 to board p2');
  });

  it('should remove the issue from a project board if it has been closed', async () => {
    mockClient.graphql.mockResolvedValueOnce({
      organization: {
        repository: {
          pullRequest: {
            projectItems: {
              nodes: [
                {
                  id: '1',
                  project: {
                    id: 'p2',
                  },
                },
              ],
            },
          },
        },
      },
    });

    mockClient.graphql.mockResolvedValueOnce({
      deleteProjectV2Item: {
        deletedItemId: 'deleted-item-id',
      },
    });

    await syncProjectBoard(client, { ...ctx, action: 'closed' }, log);
    expect(log).toHaveBeenCalledWith('Removing issue 1 from board p2');
    expect(log).toHaveBeenCalledWith(
      'Project board item is {"id":"1","project":{"id":"p2"}}',
    );
  });
});
