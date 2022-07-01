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

  it('should do nothing if action is not "closed"', async () => {
    await syncProjectBoard(client, { ...ctx }, log);
    expect(log).not.toBeCalled();
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
