import { dcoCheck } from "./dco";
import { describe, it, expect, jest } from "@jest/globals";
import { getOctokit } from "@actions/github";
import { OctokitResponse } from "@octokit/types";

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

describe("DCO notice", () => {
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
    await dcoCheck(client);

    expect(mockClient.rest.checks.listForRef).toHaveBeenCalledWith({
      repo: "backstage",
      owner: "backstage",
      ref: "abc",
      check_name: "DCO",
      status: "completed",
    });
    expect(mockClient.rest.issues.listComments).toHaveBeenCalledWith({
      repo: "backstage",
      owner: "backstage",
      issue_number: 1,
    });
    expect(mockClient.rest.issues.createComment).toHaveBeenCalledWith({
      repo: "backstage",
      owner: "backstage",
      issue_number: 1,
      body: expect.stringContaining("Thanks for the contribution!"),
    });
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
    await dcoCheck(client);

    expect(mockClient.rest.checks.listForRef).toHaveBeenCalledWith({
      repo: "backstage",
      owner: "backstage",
      ref: "abc",
      check_name: "DCO",
      status: "completed",
    });
    expect(mockClient.rest.issues.listComments).toHaveBeenCalledWith({
      repo: "backstage",
      owner: "backstage",
      issue_number: 1,
    });
    expect(mockClient.rest.issues.createComment).not.toHaveBeenCalled();
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
    await dcoCheck(client);

    expect(mockClient.rest.checks.listForRef).toHaveBeenCalledWith({
      repo: "backstage",
      owner: "backstage",
      ref: "abc",
      check_name: "DCO",
      status: "completed",
    });
    expect(mockClient.rest.issues.listComments).not.toHaveBeenCalled();
    expect(mockClient.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
