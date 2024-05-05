import * as core from '@actions/core';

export type DependencyMangerConfig = {
  branchPrefix: string;
  changesetPrefix: string;
};

export const dependencyMangerConfig: Record<string, DependencyMangerConfig> = {
  renovate: { branchPrefix: 'renovate/', changesetPrefix: 'renovate' },
  dependabot: { branchPrefix: 'dependabot/', changesetPrefix: 'dependabot' },
};

export const getDependencyManager = () => {
  return core.getInput('dependency-manager', {
    required: false,
  });
};
