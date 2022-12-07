/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import {
  basename,
  resolve as resolvePath,
  relative as relativePath,
} from 'path';

const execFile = promisify(execFileCb);

// Tells whether a path relative to the package directory has an effect
// on the published package
function isPublishedPath(path: string) {
  if (path.startsWith('dev/')) {
    return false;
  }
  if (path.includes('__mocks__')) {
    return false;
  }
  if (path.includes('__fixtures__')) {
    return false;
  }
  // Don't count manual modifications to the changelog
  if (path === 'CHANGELOG.md') {
    return false;
  }
  // API report changes by themselves don't count
  if (path === 'api-report.md' || path === 'cli-report.md') {
    return false;
  }
  // Lint changes don't count
  if (path === '.eslintrc.js') {
    return false;
  }

  const name = basename(path);
  if (name.startsWith('setupTests.')) {
    return false;
  }
  if (name.includes('.test.')) {
    return false;
  }
  if (name.includes('.stories.')) {
    return false;
  }
  return true;
}

export async function listChangedFiles(ref: string) {
  if (!ref) {
    throw new Error('ref is required');
  }

  const { stdout } = await execFile('git', ['diff', '--name-only', ref]);
  return stdout.trim().split(/\r?\n/);
}

export async function listPackages() {
  const rootPkg = require(resolvePath(process.cwd(), './package.json'));
  if (!rootPkg?.workspaces?.packages) {
    throw new Error('No workspaces found in root package.json');
  }

  const pkgs: Array<{path: string, name: string}> = [];

  // Naive workspace lookup implementation, we can't shell out to yarn here as the implementation embedded in the repo
  for (const pkgPath of rootPkg?.workspaces?.packages) {
    const readDirRecursive = (dir: string, parts: string) => {
      const [nextPart] = parts;

      // We've reached the end of the path pattern, check if package.json exists
      if (!nextPart) {
        try {
          const pkg = require(resolvePath(dir, 'package.json'));
          pkgs.push({
            path: relativePath(process.cwd(), dir),
            name: pkg.name,
          });
        } catch {
          process.stderr.write(`Failed to read package.json in ${dir}\n`);
        }
        return;
      }

      for (const filePath of fs.readdirSync(dir)) {
        if (fs.statSync(resolvePath(dir, filePath)).isDirectory()) {
          if (filePath === nextPart || nextPart === '*') {
            readDirRecursive(resolvePath(dir, filePath), parts.slice(1));
          }
        }
      }
    };

    // Split the workspace paths by / and check each directory level recursively
    readDirRecursive(process.cwd(), pkgPath.split('/'));
  }

  return pkgs;
}

export async function loadChangesets(filePaths: string[]) {
  const changesets = [];
  for (const filePath of filePaths) {
    if (!filePath.startsWith('.changeset/') || !filePath.endsWith('.md')) {
      continue;
    }
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      let lines = content.split(/\r?\n/);

      lines = lines.slice(lines.findIndex(line => line === '---') + 1);
      lines = lines.slice(
          0,
          lines.findIndex(line => line === '---'),
      );

      const bumps: Map<string, string> & { toJSON?: () => any } = new Map();
      bumps.toJSON = () => Object.fromEntries(bumps);
      for (const line of lines) {
        const match = line.match(/^'(.*)': (patch|minor|major)$/);
        if (!match) {
          throw new Error(`Invalid changeset line: ${line}`);
        }

        bumps.set(match[1], match[2]);
      }

      changesets.push({
        filePath,
        bumps,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return changesets;
}

export async function listChangedPackages(
    changedFiles: string[],
    packages: { name: any; path: any }[],
) {
  const changedPackageMap = new Map();
  for (const filePath of changedFiles) {
    for (const pkg of packages) {
      if (filePath.startsWith(`${pkg.path}/`)) {
        const pkgPath = relativePath(pkg.path, filePath);
        if (!isPublishedPath(pkgPath)) {
          break;
        }
        const entry = changedPackageMap.get(pkg.name);
        if (entry) {
          entry.files.push(pkgPath);
        } else {
          const pkgJson = require(resolvePath(pkg.path, 'package.json'));

          changedPackageMap.set(pkg.name, {
            ...pkg,
            version: pkgJson.version,
            isStable: !pkgJson.version.startsWith('0.'),
            isPrivate: Boolean(pkgJson.private),
            files: [pkgPath],
          });
        }
        break;
      }
    }
  }
  return Array.from(changedPackageMap.values());
}

function formatSection(
    prefix: string | string[] = [],
    generator: {
      (): Generator<string, void, unknown>;
      (): ArrayLike<unknown> | Iterable<unknown>;
    },
    suffix: string | string[] = [''],
) {
  const lines = Array.from(generator());
  if (lines.length === 0) {
    return '';
  }

  return [...[prefix].flat(), ...lines, ...[suffix].flat(), '', ''].join('\n');
}

export function formatSummary(changedPackages: any[], changesets: any[]) {
  const changedNames = new Set(
      changedPackages.map((pkg: { name: any }) => pkg.name),
  );

  let output = '';

  output += formatSection(
      `## Missing Changesets

The following package(s) are changed by this PR but do not have a changeset:
`,
      function* section() {
        for (const pkg of changedPackages) {
          if (
              changesets.some((c: { bumps: { get: (arg0: any) => any } }) =>
                  c.bumps.get(pkg.name),
              )
          ) {
            continue;
          }
          if (pkg.isPrivate) {
            continue;
          }
          yield `- **${pkg.name}**`;
        }
      },
      `
See [CONTRIBUTING.md](https://github.com/backstage/backstage/blob/master/CONTRIBUTING.md#creating-changesets) for more information about how to add changesets.
`,
  );

  output += formatSection(
      `## Unexpected Changesets

The following changeset(s) reference packages that have not been changed in this PR:
`,
      function* section() {
        for (const c of changesets) {
          const missing = Array.from(c.bumps.keys()).filter(
              b => !changedNames.has(b),
          );
          if (missing.length > 0) {
            yield `- **${c.filePath}**: ${missing.join(', ')}`;
          }
        }
      },
      `
Note that only changes that affect the published package require changesets, for example changes to tests and storybook stories do not require changesets.
`,
  );

  output += formatSection(
      `## Unnecessary Changesets

The following package(s) are private and do not need a changeset:
`,
      function* section() {
        for (const pkg of changedPackages) {
          if (
              changesets.some((c: { bumps: { get: (arg0: any) => any } }) =>
                  c.bumps.get(pkg.name),
              ) &&
              pkg.isPrivate
          ) {
            yield `- **${pkg.name}**`;
          }
        }
      },
  );

  output += formatSection(
      `## Changed Packages

| Package Name | Package Path | Changeset Bump | Current Version |
|:-------------|:-------------|:--------------:|:----------------|`,
      function* section() {
        const bumpMap: { [key: string]: number } = {
          undefined: -1,
          patch: 0,
          minor: 1,
          major: 2,
        };

        for (const pkg of changedPackages) {
          const maxBump =
              changesets
              .map((c: { bumps: { get: (arg0: any) => any } }) =>
                  c.bumps.get(pkg.name),
              )
              .reduce(
                  (max: string | number, bump: string | number) =>
                      bumpMap[bump] > bumpMap[max] ? bump : max,
                  undefined,
              ) ?? 'none';
          yield `| ${pkg.name} | ${pkg.path} | **${maxBump}** | \`v${pkg.version}\` |`;
        }
      },
  );

  return output;
}