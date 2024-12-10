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
import { getPackages, type Package } from '@manypkg/get-packages';

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
  if (
    path === 'cli-report.md' ||
    (path.includes('api-report') && path.endsWith('.md')) ||
    path.endsWith('.api.md') ||
    path.endsWith('.cli.md')
  ) {
    return false;
  }
  if (path === 'knip-report.md') {
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
  return stdout
    .trim()
    .split(/\r?\n/)
    .map((line: string) => resolvePath(process.cwd(), line));
}

const findPackagesInDir = async (dir: string) => {
  const { packages } = await getPackages(dir).catch(() => ({ packages: [] }));
  return packages
    .filter(p => p.relativeDir !== '.')
    .map(p => ({
      ...p,
      relativeDir: relativePath(process.cwd(), resolvePath(dir, p.relativeDir)),
    }));
};

export async function listPackages({
  multipleWorkspaces,
}: {
  multipleWorkspaces?: boolean;
}) {
  if (!multipleWorkspaces) {
    return findPackagesInDir(process.cwd());
  }

  const workspacesRoot = resolvePath(process.cwd(), 'workspaces');
  const workspaceDirs = await fs.promises.readdir(workspacesRoot);

  return await Promise.all(
    workspaceDirs.map(workspace =>
      findPackagesInDir(resolvePath(workspacesRoot, workspace)),
    ),
  ).then(packages => packages.flat());
}

export async function loadChangesets(filePaths: string[]) {
  const changesets = [];
  for (const filePath of filePaths) {
    if (
      !filePath.includes('.changeset/') ||
      !filePath.endsWith('.md') ||
      filePath.endsWith('README.md')
    ) {
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
  packages: Package[],
) {
  const changedPackageMap = new Map();
  for (const filePath of changedFiles) {
    for (const pkg of packages) {
      if (filePath.startsWith(`${pkg.dir}/`)) {
        const pkgPath = relativePath(pkg.dir, filePath);
        if (!isPublishedPath(pkgPath)) {
          break;
        }
        const entry = changedPackageMap.get(pkg.packageJson.name);
        if (!entry) {
          changedPackageMap.set(pkg.packageJson.name, {
            ...pkg,
            isStable: !pkg.packageJson.version.startsWith('0.'),
            isPrivate: Boolean(pkg.packageJson.private),
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

export function formatSummary(
  changedPackages: (Package & { isStable: boolean; isPrivate: boolean })[],
  changesets: { filePath: string; bumps: Map<string, string> }[],
) {
  const changedNames = new Set(
    changedPackages.map(pkg => pkg.packageJson.name),
  );

  let output = '';

  if (
    changedPackages.length > 0 &&
    changesets.some(e => [...e.bumps.values()].some(e => e !== 'patch'))
  ) {
    output += `> [!IMPORTANT]
> This PR includes changes that affect public-facing API. Please ensure you are adding/updating documentation for new features or behavior.\n\n`;
  }

  output += formatSection(
    `## Missing Changesets

The following package(s) are changed by this PR but do not have a changeset:
`,
    function* section() {
      for (const pkg of changedPackages) {
        if (
          changesets.some((c: { bumps: { get: (arg0: any) => any } }) =>
            c.bumps.get(pkg.packageJson.name),
          )
        ) {
          continue;
        }
        if (pkg.isPrivate) {
          continue;
        }
        yield `- **${pkg.packageJson.name}**`;
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
            c.bumps.get(pkg.packageJson.name),
          ) &&
          pkg.isPrivate
        ) {
          yield `- **${pkg.packageJson.name}**`;
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
              c.bumps.get(pkg.packageJson.name),
            )
            .reduce(
              (max: string | number, bump: string | number) =>
                bumpMap[bump] > bumpMap[max] ? bump : max,
              undefined,
            ) ?? 'none';
        yield `| ${pkg.packageJson.name} | ${pkg.relativeDir} | **${maxBump}** | \`v${pkg.packageJson.version}\` |`;
      }
    },
  );

  return output;
}
