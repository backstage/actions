import * as core from '@actions/core';
import * as github from '@actions/github';

export async function postFeedback(
    client: ReturnType<typeof github.getOctokit>,
    options: {
      owner: string;
      repo: string;
      issueNumberStr: string;
    },
    marker: string,
    feedback: string,
    log = core.info,
){
  const {owner, repo, issueNumberStr} = options;
  const issue_number = Number(issueNumberStr);
  const body = feedback.trim() ? feedback + marker : undefined

  const existingComments = await client.paginate(client.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
  });

  const existingComment = existingComments.find((c) =>
      c.user?.login === "github-actions[bot]" &&
      c.body?.includes(marker)
  );

  if (existingComment) {
    if (body) {
      if (existingComment.body !== body) {
        log(`updating existing comment in #${issueNumberStr}`);
        await client.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body,
        });
      } else {
        log(`skipped update of identical comment in #${issueNumberStr}`);
      }
    } else {
      log(`removing comment from #${issueNumberStr}`);
      await client.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
    }
  } else if (body) {
    log(`creating comment for #${issueNumberStr}`);
    await client.rest.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
  }
}
