import * as core from '@actions/core';
import * as github from '@actions/github';
import { createAppAuth } from '@octokit/auth-app';

interface Options {
  appId: string;
  privateKey: string;
  // organization: string;
}

export function readGetApplicationTokenOptions(): Options {
  return {
    appId: core.getInput('app-id', { required: true }),
    privateKey: core.getInput('private-key', { required: true }),
    // organization: core.getInput('organization', { required: true }),
  };
}

export function getApplicationToken(options: Options) {
  const { appId, privateKey } = options;

  const client = github.getOctokit('', {
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
  return client;
}
