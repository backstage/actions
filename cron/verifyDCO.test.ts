import { describe, it, expect, jest } from "@jest/globals";
import { getOctokit } from "@actions/github";
import { verifyDCO } from "./verifyDCO";

type Octokit = ReturnType<typeof getOctokit>;

const mockClient = {
  paginate: jest.fn(async (fn, args) => (await fn(args)).data),
  rest: {
    pulls: {
      list: jest.fn<Octokit["rest"]["pulls"]["list"]>(),
    },
    checks: {
      listForRef: jest.fn<Octokit["rest"]["checks"]["listForRef"]>(),
    },
    issues: {
      createComment: jest.fn<Octokit["rest"]["issues"]["createComment"]>(),
      listComments: jest.fn<Octokit["rest"]["issues"]["listComments"]>(),
    },
  },
  request: {},
  graphql: jest.fn(),
};
const client = mockClient as unknown as Octokit;
const log = jest.fn();
const repoInfo = {
  owner: "le-owner",
  repo: "le-repo",
};

describe("verifyDCO", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should comment when DCO is missing", async () => {
    mockClient.rest.pulls.list.mockResolvedValue({
      data: [
        {
          number: 1,
          head: { sha: "abc" },
        },
      ],
    } as any);
    mockClient.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [{ conclusion: "action_required" }] },
    } as any);
    mockClient.rest.issues.listComments.mockResolvedValue({
      data: [{ user: { login: "boopy" } }],
    } as any);
    await verifyDCO(client, repoInfo, log);

    expect(mockClient.rest.checks.listForRef).toHaveBeenCalledWith({
      owner: "le-owner",
      repo: "le-repo",
      ref: "abc",
      check_name: "DCO",
      status: "completed",
    });
    expect(mockClient.rest.issues.listComments).toHaveBeenCalledWith({
      owner: "le-owner",
      repo: "le-repo",
      issue_number: 1,
    });
    expect(mockClient.rest.issues.createComment).toHaveBeenCalledWith({
      owner: "le-owner",
      repo: "le-repo",
      issue_number: 1,
      body: expect.stringContaining("Thanks for the contribution!"),
    });
    expect(log).toHaveBeenCalledWith("Creating comment on PR #1");
  });

  it("should not comment when DCO is already added", async () => {
    mockClient.rest.pulls.list.mockResolvedValue({
      data: [
        {
          number: 1,
          head: { sha: "abc" },
        },
      ],
    } as any);
    mockClient.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [{ conclusion: "action_required" }] },
    } as any);
    mockClient.rest.issues.listComments.mockResolvedValue({
      data: [
        { user: { login: "boopy" } },
        {
          user: { login: "github-actions[bot]" },
          body: "<!-- dco -->yadayada",
        },
      ],
    } as any);
    await verifyDCO(client, repoInfo, log);

    expect(mockClient.rest.checks.listForRef).toHaveBeenCalledWith({
      owner: "le-owner",
      repo: "le-repo",
      ref: "abc",
      check_name: "DCO",
      status: "completed",
    });
    expect(mockClient.rest.issues.listComments).toHaveBeenCalledWith({
      owner: "le-owner",
      repo: "le-repo",
      issue_number: 1,
    });
    expect(mockClient.rest.issues.createComment).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Already commented on PR #1, skipping");
  });

  it("should not comment when check run is not completed", async () => {
    mockClient.rest.pulls.list.mockResolvedValue({
      data: [
        {
          number: 1,
          head: { sha: "abc" },
        },
      ],
    } as any);
    mockClient.rest.checks.listForRef.mockResolvedValue({
      data: { check_runs: [{ conclusion: "ongoing" }] },
    } as any);
    await verifyDCO(client, repoInfo, log);

    expect(mockClient.rest.checks.listForRef).toHaveBeenCalledWith({
      owner: "le-owner",
      repo: "le-repo",
      ref: "abc",
      check_name: "DCO",
      status: "completed",
    });
    expect(mockClient.rest.issues.listComments).not.toHaveBeenCalled();
    expect(mockClient.rest.issues.createComment).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("No checks found for PR #1, skipping");
  });
});
