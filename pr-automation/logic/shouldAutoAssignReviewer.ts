export function shouldAutoAssignReviewer(options: {
  reviewState?: string;
  reviewerLogin: string;
  assignees: string[];
  maintainerLogins?: Set<string>;
}): boolean {
  const { reviewState, reviewerLogin, assignees, maintainerLogins } = options;

  if (reviewState !== 'changes_requested') {
    return false;
  }

  if (assignees.length > 0) {
    return false;
  }

  if (!maintainerLogins?.has(reviewerLogin)) {
    return false;
  }

  return true;
}
