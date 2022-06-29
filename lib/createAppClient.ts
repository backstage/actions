import * as core from '@actions/core';
import * as github from '@actions/github';
import { createAppAuth } from '@octokit/auth-app';

export function createAppClient() {
  const appId = core.getInput('app-id', { required: true });
  const privateKey = core.getInput('private-key', { required: true });

  core.info(`appId: ${appId}`);
  core.setSecret(privateKey);

  return github.getOctokit('', {
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}
