import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import { getOctokit } from '@actions/github';
import { postFeedback } from "./postFeedback";

type Octokit = ReturnType<typeof getOctokit>;

const feedback = `
## Missing Changesets

The following package(s) are changed by this PR but do not have a changeset:

- **@backstage/app-defaults**

See [CONTRIBUTING.md](https://github.com/backstage/backstage/blob/master/CONTRIBUTING.md#creating-changesets) for more information about how to add changesets.


## Changed Packages

| Package Name | Package Path | Changeset Bump | Current Version |
|:-------------|:-------------|:--------------:|:----------------|
| @backstage/app-defaults | packages/app-defaults | **none** | \`v1.0.9-next.1\` |
`;

const feedbackUpdated = `
## Changed Packages

| Package Name | Package Path | Changeset Bump | Current Version |
|:-------------|:-------------|:--------------:|:----------------|
| @backstage/app-defaults | packages/app-defaults | **none** | \`v1.0.9-next.1\` |
`;

const mockClient = {
  paginate: jest.fn(async (fn, args) => await (fn(args)).data),
  rest: {
    pulls: {
      list: jest.fn<Octokit['rest']['pulls']['list']>(),
    },
    checks: {
      listForRef: jest.fn<Octokit['rest']['checks']['listForRef']>(),
    },
    issues: {
      listComments: jest.fn<Octokit['rest']['issues']['listComments']>(),
      updateComment: jest.fn<Octokit['rest']['issues']['updateComment']>(),
      deleteComment: jest.fn<Octokit['rest']['issues']['deleteComment']>(),
      createComment: jest.fn<Octokit['rest']['issues']['createComment']>(),
    },
  },
};

const client = mockClient as unknown as Octokit;
const repoInfo = {
  owner: 'le-owner',
  repo: 'le-repo',
};
const log = jest.fn();
const marker = "changeset-feedback";
const body =  (feedback: string) => feedback.trim() ? feedback + marker : undefined
const commentsWithFeedBack = [
  {
    user: {login: 'test'},
    body: 'I need a review'
  },
  {
    user: {login: 'github-actions[bot]'},
    body: body(feedback)
  },
];
describe('changeset feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should post feedback', async () => {
    mockClient.paginate.mockResolvedValue([{
      user: {login: 'test'},
      body: 'I need a review'
    }]);

    await postFeedback(client, {...repoInfo, issueNumberStr: '1'}, marker, feedback, log);
    expect(mockClient.rest.issues.createComment).toHaveBeenCalledWith({
      ...repoInfo,
      body: body(feedback),
      issue_number: 1,
    });
    expect(log).toHaveBeenCalledWith('creating comment for #1');
  });

  it('should skip updating comment', async () => {
    mockClient.paginate.mockResolvedValue(commentsWithFeedBack);
    await postFeedback(client, {...repoInfo, issueNumberStr: '1'}, marker, feedback, log);
    expect(mockClient.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('skipped update of identical comment in #1')
  });

  it('should update the comment', async () => {
    mockClient.paginate.mockResolvedValue(commentsWithFeedBack);
    await postFeedback(client, {...repoInfo, issueNumberStr: '1'}, marker, feedbackUpdated, log);
    expect(log).toHaveBeenCalledWith('updating existing comment in #1');
    expect(mockClient.rest.issues.updateComment).toHaveBeenCalledWith({
      ...repoInfo,
      body: body(feedbackUpdated),
      "comment_id": undefined,
    });
  });

  it('should delete the comment', async () => {
    mockClient.paginate.mockResolvedValue(commentsWithFeedBack);
    await postFeedback(client, {...repoInfo, issueNumberStr: '1'}, '', '', log);
    expect(mockClient.rest.issues.deleteComment).toHaveBeenCalledWith({
      ...repoInfo,
      "comment_id": undefined,
    })
    expect(log).toHaveBeenCalledWith('removing comment from #1');
  });
});
