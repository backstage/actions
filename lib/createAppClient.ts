import * as core from '@actions/core';
import { GitHub } from '@actions/github/lib/utils';
import { createAppAuth } from '@octokit/auth-app';
import { withRetry, RetryOptions } from './withRetry';

const RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  initialDelayMs: 500,
};

export function createAppClient() {
  const appId = core.getInput('app-id', { required: true });
  const privateKey = core.getInput('private-key', { required: true });
  const installationId = core.getInput('installation-id', { required: true });

  const client = new GitHub({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });

  // Retry transient network errors (e.g. "socket hang up") with exponential backoff.
  client.hook.wrap('request', (request, options) =>
    withRetry(() => request(options), RETRY_OPTIONS),
  );

  return client;
}
