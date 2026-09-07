import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

describe('yarn-install action', () => {
  it('does not pass the install flag through Yarn configuration', () => {
    const action = readFileSync(join(__dirname, 'action.yml'), 'utf8');

    expect(action).not.toMatch(/^\s+YARN_[A-Z_]*INSTALL_FLAG:/m);
    expect(action).toContain(
      'INSTALL_FLAG: ${{ steps.yarn-cache.outputs.install-flag }}',
    );
    expect(action).toContain('run: yarn install "$INSTALL_FLAG"');
  });
});
