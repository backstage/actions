import * as core from '@actions/core';
import * as github from '@actions/github';

export function foo(foo?: string) {
  return true;
}

try {
  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput('test');
  console.log(`Hello ${nameToGreet}!`);
  const time = new Date().toTimeString();
  core.setOutput('time', time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2);
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(String(error));
}
