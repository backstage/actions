import { describe, it, expect, jest } from '@jest/globals';
import { getOctokit } from '@actions/github';
import { syncIssueLabels } from './syncIssueLabels';

type Octokit = ReturnType<typeof getOctokit>;

const mockClient = {
  rest: {
    issues: {
      addLabels: jest.fn<Octokit['rest']['issues']['addLabels']>(),
    },
  },
};
const client = mockClient as unknown as Octokit;
const ctx = {
  owner: 'le-owner',
  repo: 'le-repo',
  issueNumber: 1,
};
const log = jest.fn();

describe('syncIssueLabels', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['This is a catalog PR for TechDocs', ['area:catalog', 'area:techdocs']],
    ['I fix tech docs', ['area:techdocs']],
    ['tech-docs is great', ['area:techdocs']],
    ['search is awesome', ['area:discoverability']],
    ['catalog is catalog', ['area:catalog']],
    ['scaffolder boop', ['area:scaffolder']],
    ['Fixed an issue', []],
    ['symtech docsilatin', ['area:techdocs']],
    ['Fix software templates execution', []],
    ['catacatalogalog', ['area:catalog']],
    ['a cat a log', []],
    ['my lovely new permission', ['area:permission']],
    ['love the permissions framework', ['area:permission']],
    ['permission-framework rocks', ['area:permission']],
  ])('should add labels %i', async (title, labels) => {
    await syncIssueLabels(client, { ...ctx, issueTitle: title }, log);
    if (labels.length) {
      expect(mockClient.rest.issues.addLabels).toHaveBeenCalledWith({
        owner: 'le-owner',
        repo: 'le-repo',
        issue_number: 1,
        labels: expect.arrayContaining(labels),
      });
    } else {
      expect(mockClient.rest.issues.addLabels).not.toHaveBeenCalled();
    }
  });

  it('should not add issues if there is no title', async () => {
    await syncIssueLabels(client, { ...ctx, issueTitle: undefined }, log);
    expect(mockClient.rest.issues.addLabels).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('No issue title for le-owner/le-repo#1');
  });
});
