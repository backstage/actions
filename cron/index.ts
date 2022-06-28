import * as core from "@actions/core";
import * as github from "@actions/github";
import { verifyDCO } from "./verifyDCO";

async function main() {
  console.log(`Running cron!`);
  const token = core.getInput("github-token", { required: true });
  await verifyDCO(github.getOctokit(token), github.context.repo);
}

main().catch((error) => {
  console.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
