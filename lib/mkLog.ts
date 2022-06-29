import * as core from '@actions/core';

export function mkLog(prefix: string) {
  return (msg: string) => {
    core.info(`[${prefix}]: ${msg}`);
  };
}
