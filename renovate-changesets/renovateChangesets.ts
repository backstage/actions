import { getExecOutput, exec } from '@actions/exec';
import fs from 'fs/promises';
import { resolve as resolvePath, relative as relativePath } from 'path';
import { getPackages, type Package } from '@manypkg/get-packages';

export async function getBranchName() {
  const { stdout } = await getExecOutput('git', ['branch', '--show-current']);
  return stdout;
}

const findPackagesInDir = async ({
  dir,
  includeRoots,
}: {
  includeRoots: boolean;
  dir: string;
}) => {
  const { packages, rootPackage } = await getPackages(dir).catch(() => ({
    packages: [],
    rootPackage: undefined,
  }));

  return [...packages, rootPackage && { ...rootPackage, isRoot: true }]
    .filter((p): p is Package & { isRoot?: boolean } => Boolean(p))
    .map(p => ({
      ...p,
      isRoot: p.isRoot ?? false,
      relativeDir: relativePath(process.cwd(), resolvePath(dir, p.relativeDir)),
    }))
    .filter(({ isRoot }) => (!includeRoots ? !isRoot : true));
};

export async function getChangesetFilename() {
  const { stdout: shortHash } = await getExecOutput(
    'git rev-parse --short HEAD',
  );
  return `.changeset/renovate-${shortHash.trim()}.md`;
}

export async function createChangeset(
  fileName: string,
  packageBumps: Map<string, string>,
  packages: string[],
) {
  let message = '';
  for (const [pkg, bump] of packageBumps) {
    message = message + `Updated dependency \`${pkg}\` to \`${bump}\`.\n`;
  }

  const pkgs = packages.map(pkg => `'${pkg}': patch`).join('\n');
  const body = `---\n${pkgs}\n---\n\n${message.trim()}\n`;
  await fs.writeFile(fileName, body);
}

export const getChangedFiles = async () => {
  const diffOutput = await getExecOutput('git diff --name-only HEAD~1');
  return diffOutput.stdout.split('\n');
};

export async function getBumps(
  files: string[],
  excludeDevDependencies: boolean,
) {
  const bumps = new Map();
  for (const file of files) {
    const { stdout: changes } = await getExecOutput('git', ['show', file]);

    // Load the package.json for the current workspace to identify devDependencies
    const packageJsonPath = resolvePath(dirname(file), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    for (const change of changes.split('\n')) {
      if (!change.startsWith('+ ')) {
        continue;
      }
      const match = change.match(/"(.*?)"/g);
      if (match) {
        const deps = match[0].replace(/"/g, '');
        const depsVersion = match[1].replace(/"/g, '');

        // If the dependency exists in regular dependencies
        if (dependencies[deps]) {
          bumps.set(deps, depsVersion);
        }

        // If it's a devDependency and we're not excluding them
        if (!excludeDevDependencies && devDependencies[deps]) {
          bumps.set(deps, depsVersion);
        }
      }
    }
  }
  return bumps;
}

export async function commitAndPush(fileNames: string[]) {
  await exec('git', ['add', ...fileNames]);
  await exec('git commit -C HEAD --amend --no-edit');
  await exec('git push --force');
}

export async function listPackages({
  isMultipleWorkspaces,
  includeRoots = false,
}: {
  isMultipleWorkspaces?: boolean;
  includeRoots?: boolean;
}): Promise<(Package & { isRoot: boolean })[]> {
  if (!isMultipleWorkspaces) {
    return findPackagesInDir({ dir: process.cwd(), includeRoots });
  }

  const workspacesRoot = resolvePath(process.cwd(), 'workspaces');
  const workspaceDirs = await fs.readdir(workspacesRoot);

  return await Promise.all(
    workspaceDirs.map(workspace =>
      findPackagesInDir({
        dir: resolvePath(workspacesRoot, workspace),
        includeRoots,
      }),
    ),
  ).then(packages => packages.flat());
}
