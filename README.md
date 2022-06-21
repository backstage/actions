# Backstage Actions

This repository contains GitHub actions related to Backstage. The goal of the
current actions are to help manage the maintenance of the main Backstage
repository.

## TODO:

- [ ]: Get this repo set up with two initial actions, one for PR sync, and one
  for cron polling.
- [ ]: Migrate all existing custom workflow scripts from backstage/backstage
  into these new actions.

  - [ ]: Migrate `.github/workflows/automate_merge_renovate_prs.yaml`
  - [ ]: Migrate `.github/workflows/automate_review-labels-scheduled.yaml`
  - [ ]: Migrate `.github/workflows/automate_review-labels.yaml`
  - [ ]: Migrate `.github/workflows/sync_approve_renovate_pr.yaml`
  - [ ]: Migrate `.github/workflows/sync_issue-labels.yml`
  - [ ]: Migrate `.github/workflows/verify_dco.yaml`
  - [ ]: Maybe migrate `.github/workflows/sync_dependabot-changesets.yml`?
  - [ ]: Maybe migrate `.github/workflows/sync_renovate-changesets.yml`?

- New features targeting the maintenance project board:
  - [ ]: Remove items from the board instead of setting the status to "Done".
  - [ ]: Automate the move to the "Changes Requested" column.
  - [ ]: Custom logic for adding PRs to the board, skip PRs that do not have
    DCO, but add them once they do.
