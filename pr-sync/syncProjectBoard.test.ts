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
  boardNumber: 2,
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
      organization: {
        projectsV2: {
          nodes: [
            {
              id: 'p1',
              number: 1,
            },
            {
              id: 'p2',
              number: 2,
            },
          ],
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
    expect(log).toHaveBeenCalledWith(`Adding PR 1 to board 2`);
  });

  it('should fail to add to board if project is not found', async () => {
    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          id: 'pr-id',
        },
      },
      organization: {
        projectsV2: {
          nodes: [
            {
              id: 'p1',
              number: 1,
            },
            {
              id: 'p3',
              number: 3,
            },
          ],
        },
      },
    });

    await expect(
      syncProjectBoard(client, { ...ctx, action: 'reopened' }, log),
    ).rejects.toThrow('No project was found for board number 2');
    expect(log).toHaveBeenCalledWith(`Adding PR 1 to board 2`);
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
                    id: 'blob',
                    number: 2,
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
    expect(log).toHaveBeenCalledWith('Removing issue 1 from board 2');
    expect(log).toHaveBeenCalledWith(
      'Project board item is {"id":"1","project":{"id":"blob","number":2}}',
    );
  });
});
