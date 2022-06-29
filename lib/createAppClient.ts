import * as core from '@actions/core';
import { GitHub } from '@actions/github/lib/utils';
import { createAppAuth } from '@octokit/auth-app';

export function createAppClient() {
  const appId = core.getInput('app-id', { required: true });
  const privateKey = core.getInput('private-key', { required: true });

  core.info(`appId: ${appId}`);
  core.setSecret(privateKey);

  return new GitHub({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}
