import * as core from '@actions/core';

export const getDependencyManager = (): string => {
  return core
    .getInput('dependency-manager', {
      required: false,
    })
    .trim()
    .toLowerCase();
};
