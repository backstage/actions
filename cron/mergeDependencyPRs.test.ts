import { describe, it, expect, jest } from '@jest/globals';
import { getOctokit } from '@actions/github';
import { mergeDependencyPRs } from './mergeDependencyPRs';

type Octokit = ReturnType<typeof getOctokit>;

const mockClient = {
  rest: {
    pulls: {
      merge: jest.fn<Octokit['rest']['pulls']['merge']>(),
    },
  },
  graphql: jest.fn<Octokit['graphql']>(),
};
const client = mockClient as unknown as Octokit;
const log = jest.fn();
const repoInfo = {
  owner: 'le-owner',
  repo: 'le-repo',
};

describe('mergeDependencyPRs', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should merge green renovate PRs', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'renovate' },
              mergeable: 'MERGEABLE',
              reviewDecision: 'APPROVED',
              changedFiles: 1,
              files: {
                nodes: [{ path: 'yarn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).toHaveBeenCalledWith({
      owner: 'le-owner',
      repo: 'le-repo',
      pull_number: 1,
    });
    expect(log).toBeCalledWith('Merging #1 - test-pr');
  });

  it('should merge green dependabot PRs', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'dependabot' },
              mergeable: 'MERGEABLE',
              reviewDecision: 'APPROVED',
              changedFiles: 1,
              files: {
                nodes: [{ path: 'yarn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).toHaveBeenCalledWith({
      owner: 'le-owner',
      repo: 'le-repo',
      pull_number: 1,
    });
    expect(log).toBeCalledWith('Merging #1 - test-pr');
  });

  it('should merge PRs from later pages', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql
      .mockResolvedValueOnce({
        repository: {
          pullRequests: {
            pageInfo: {
              hasNextPage: true,
              endCursor: 'first-page',
            },
            nodes: [],
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          pullRequests: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
            nodes: [
              {
                title: 'test-pr',
                number: 1,
                author: { login: 'renovate' },
                mergeable: 'MERGEABLE',
                reviewDecision: 'APPROVED',
                changedFiles: 1,
                files: {
                  nodes: [{ path: 'yarn.lock' }],
                },
                commits: {
                  nodes: [
                    { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                  ],
                },
              },
            ],
          },
        },
      });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.graphql).toHaveBeenLastCalledWith(expect.any(String), {
      owner: 'le-owner',
      repo: 'le-repo',
      after: 'first-page',
    });
    expect(mockClient.rest.pulls.merge).toHaveBeenCalledWith({
      owner: 'le-owner',
      repo: 'le-repo',
      pull_number: 1,
    });
  });

  it('should not merge PRs from unknown authors', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'notovate' },
              mergeable: 'MERGEABLE',
              reviewDecision: 'APPROVED',
              changedFiles: 1,
              files: {
                nodes: [{ path: 'yarn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).not.toHaveBeenCalledWith();
    expect(log).toBeCalledWith('No mergeable PRs');
  });

  it('should not merge on Tuesdays', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-28T00:00:00.000Z') });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).not.toHaveBeenCalled();
    expect(log).toBeCalledWith(
      'Skipping auto merge because Tuesday is release day',
    );
  });

  it('should not merge if multiple files are changed', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'renovate' },
              mergeable: 'MERGEABLE',
              reviewDecision: 'APPROVED',
              changedFiles: 2,
              files: {
                nodes: [{ path: 'yarn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).not.toHaveBeenCalled();
    expect(log).toBeCalledWith('No mergeable PRs');
  });

  it('should not merge if not mergable', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'renovate' },
              mergeable: 'UNMERGEABLE',
              reviewDecision: 'APPROVED',
              changedFiles: 1,
              files: {
                nodes: [{ path: 'yarn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).not.toHaveBeenCalled();
    expect(log).toBeCalledWith('No mergeable PRs');
  });

  it('should not merge if not approved', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'renovate' },
              mergeable: 'MERGEABLE',
              reviewDecision: 'UNACCEPTABLE',
              changedFiles: 1,
              files: {
                nodes: [{ path: 'yarn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).not.toHaveBeenCalled();
    expect(log).toBeCalledWith('No mergeable PRs');
  });

  it('should not merge if not yarn.lock change', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'renovate' },
              mergeable: 'MERGEABLE',
              reviewDecision: 'APPROVED',
              changedFiles: 1,
              files: {
                nodes: [{ path: 'darn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'SUCCESS' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).not.toHaveBeenCalled();
    expect(log).toBeCalledWith('No mergeable PRs');
  });

  it('should not merge unless all checks are green', async () => {
    jest.useFakeTimers({ now: new Date('2022-06-27T00:00:00.000Z') });

    mockClient.graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: [
            {
              title: 'test-pr',
              number: 1,
              author: { login: 'renovate' },
              mergeable: 'MERGEABLE',
              reviewDecision: 'APPROVED',
              changedFiles: 1,
              files: {
                nodes: [{ path: 'yarn.lock' }],
              },
              commits: {
                nodes: [
                  { commit: { statusCheckRollup: { state: 'PROCESSING' } } },
                ],
              },
            },
          ],
        },
      },
    });

    await mergeDependencyPRs(client, repoInfo, log, 0);
    expect(mockClient.rest.pulls.merge).not.toHaveBeenCalled();
    expect(log).toBeCalledWith('No mergeable PRs');
  });
});
