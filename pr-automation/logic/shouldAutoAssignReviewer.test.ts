import { shouldAutoAssignReviewer } from './shouldAutoAssignReviewer';

describe('shouldAutoAssignReviewer', () => {
  const maintainerLogins = new Set(['maintainer1', 'maintainer2']);

  it('should assign a maintainer who requests changes on an unassigned PR', () => {
    expect(
      shouldAutoAssignReviewer({
        reviewState: 'changes_requested',
        reviewerLogin: 'maintainer1',
        assignees: [],
        maintainerLogins,
      }),
    ).toBe(true);
  });

  it('should not assign if the review is not changes_requested', () => {
    expect(
      shouldAutoAssignReviewer({
        reviewState: 'approved',
        reviewerLogin: 'maintainer1',
        assignees: [],
        maintainerLogins,
      }),
    ).toBe(false);

    expect(
      shouldAutoAssignReviewer({
        reviewState: 'commented',
        reviewerLogin: 'maintainer1',
        assignees: [],
        maintainerLogins,
      }),
    ).toBe(false);

    expect(
      shouldAutoAssignReviewer({
        reviewState: undefined,
        reviewerLogin: 'maintainer1',
        assignees: [],
        maintainerLogins,
      }),
    ).toBe(false);
  });

  it('should not assign if the PR already has assignees', () => {
    expect(
      shouldAutoAssignReviewer({
        reviewState: 'changes_requested',
        reviewerLogin: 'maintainer1',
        assignees: ['someone'],
        maintainerLogins,
      }),
    ).toBe(false);
  });

  it('should not assign if the reviewer is not a maintainer', () => {
    expect(
      shouldAutoAssignReviewer({
        reviewState: 'changes_requested',
        reviewerLogin: 'outsider',
        assignees: [],
        maintainerLogins,
      }),
    ).toBe(false);
  });

  it('should not assign if the maintainers team is not available', () => {
    expect(
      shouldAutoAssignReviewer({
        reviewState: 'changes_requested',
        reviewerLogin: 'maintainer1',
        assignees: [],
        maintainerLogins: undefined,
      }),
    ).toBe(false);
  });
});
