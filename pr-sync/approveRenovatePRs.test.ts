import { describe, it, expect, jest } from '@jest/globals';
import { getOctokit } from '@actions/github';
import { approveRenovatePRs } from './approveRenovatePRs';

type Octokit = ReturnType<typeof getOctokit>;

const mockClient = {
  rest: {
    pulls: {
      createReview: jest.fn<Octokit['rest']['pulls']['createReview']>(),
      listFiles: jest.fn<Octokit['rest']['pulls']['listFiles']>(),
    },
  },
};
const client = mockClient as unknown as Octokit;
const ctx = {
  owner: 'le-owner',
  repo: 'le-repo',
  issueNumber: 1,
  actor: 'renovate[bot]',
};
const log = jest.fn();

describe('mergeRenovatePRs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should approve PR', async () => {
    mockClient.rest.pulls.listFiles.mockResolvedValueOnce({
      data: [{ filename: 'yarn.lock' }],
    } as any);

    await approveRenovatePRs(client, ctx, log);
    expect(mockClient.rest.pulls.createReview).toHaveBeenCalledWith({
      owner: 'le-owner',
      repo: 'le-repo',
      pull_number: 1,
      event: 'APPROVE',
    });
  });

  it('should not review PR changing multiple files', async () => {
    mockClient.rest.pulls.listFiles.mockResolvedValueOnce({
      data: [{ filename: 'yarn.lock' }, { filename: 'yarn.stock' }],
    } as any);

    await approveRenovatePRs(client, ctx, log);
    expect(mockClient.rest.pulls.createReview).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'skipping approval since some files are not yarn.lock',
    );
  });

  it('should not review PR not from renovate', async () => {
    mockClient.rest.pulls.listFiles.mockResolvedValueOnce({
      data: [{ filename: 'yarn.lock' }, { filename: 'yarn.stock' }],
    } as any);

    await approveRenovatePRs(client, { ...ctx, actor: 'notovate' }, log);
    expect(mockClient.rest.pulls.createReview).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
