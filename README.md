# Backstage Actions

This repository contains GitHub actions related to Backstage. The goal of the
current actions are to help manage the maintenance of the main Backstage
repository.

## TODO

- [x] Get this repo set up with two initial actions, one for PR sync, and one
      for cron polling.
- [ ] Migrate all existing custom workflow scripts from backstage/backstage into
      these new actions.

  - [x] Migrate `.github/workflows/automate_merge_renovate_prs.yaml`
  - [ ] Migrate `.github/workflows/automate_review-labels-scheduled.yaml`
  - [x] Migrate `.github/workflows/automate_review-labels.yaml`
  - [x] Migrate `.github/workflows/sync_approve_renovate_pr.yaml`
  - [x] Migrate `.github/workflows/sync_issue-labels.yml`
  - [x] Migrate `.github/workflows/verify_dco.yaml`
  - [ ] Maybe migrate `.github/workflows/sync_dependabot-changesets.yml`?
  - [ ] Maybe migrate `.github/workflows/sync_renovate-changesets.yml`?

- New features targeting the maintenance project board:

  - [x] Remove items from the board instead of setting the status to "Done".
  - [ ] Automate the move to the "Changes Requested" column.
  - [ ] Custom logic for adding PRs to the board, skip PRs that do not have DCO,
        but add them once they do.

- Assigning PRs:

  - Pros:
    - Less context switching for reviewers
    - Higher throughput
    - PRs are assigned to people familiar with the code
    - Goalie workload is reduced
    - Goalie can join the mob
  - Cons:
    - Needs tooling / processes
  - Risks:
    - When do we review PRs then? Needs dedicated time?
    - Assigning PRs based on familiarity can lead to silos
    - Stale waiting on reviewer because of unknown reasons? Vacations or sickness?

- PR WoW changes?

  ```
  assign -> triage -> needs review -> merge/close
              |             ^
              v             |
          external          v
                     changes requested
  ```

  Assign: The PR is assigned to a random user

  Triage:

  - If the PR is touching only files that are owned by a particular group, then remove the assignment, and external state, or remove from the board?

- TODO:

  - Random Assign
    -> [x] Each PR that is opened should randomly be assigned to a mammal
    -> [x] Try to automate pulp PRs as external (if only containing docs or search label)
    -> [x] Exclude OOO members, make this action input and store the state in a secret
    -> [x] Do not assign author to their own PR
    -> [x] Add added timestamp
    -> [ ] Add changed timestamp
  - Triage
    -> [ ] add new triage result states as needed
  - Needs review
    -> [x] use the built-in changes request automation
  - Changes requested
    -> [x] build automation for moving PRs back to 'Re-Review' when needed, migrate awaiting review label workflow to this
  - Merge/close
    -> [x] remove from board
  - [x] Verify that it works with forks

## Docs

- [Creating a JavaScript action](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action)
- [actions/github-script](https://github.com/actions/github-script)
