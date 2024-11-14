import * as core from '@actions/core';
import {
  commitAndPush,
  createChangeset,
  getBranchName,
  getBumps,
  getChangedFiles,
  getChangesetFilename,
  listPackages,
} from './renovateChangesets';
import { relative as relativePath, resolve as resolvePath } from 'path';

async function main() {
  core.info('Running Renovate Changesets');

  const isMultipleWorkspaces = core.getBooleanInput('multiple-workspaces', {
    required: false,
  });

  const excludeDevDependencies = core.getBooleanInput(
    'excludeDevDependencies',
    { required: false },
  );

  const branchName = await getBranchName();

  if (!branchName.startsWith('renovate/')) {
    core.info('Not a renovate branch, skipping');
    return;
  }

  const allPackages = await listPackages({
    isMultipleWorkspaces,
    includeRoots: true,
  });

  // If a package is private it's not being published
  // which means it doesn't need a changeset
  const publicPackages = allPackages.filter(p => !p.packageJson.private);

  // Need to remove the topmost package if we're in a multi-workspace setup
  const packageList = isMultipleWorkspaces
    ? publicPackages.filter(p => p.dir !== process.cwd())
    : publicPackages;

  const changedFiles = await getChangedFiles();

  // Group file changes by workspace, and drop workspaces without changes
  const changedFilesByWorkspace = new Map<string, string[]>(
    packageList
      .filter(p => p.isRoot)
      .map(p => [
        p.dir,
        changedFiles
          .filter(f => f.startsWith(p.relativeDir))
          .map(f => relativePath(p.dir, f)),
      ])
      .filter((workspaceChanges): workspaceChanges is [string, string[]] => {
        const [_, files] = workspaceChanges;
        return files.length > 0;
      }),
  );

  // Check if those workspaces have changesets
  const changedWorkspacesWithChangeset = new Map<string, boolean>(
    Array.from(changedFilesByWorkspace.entries()).map(([workspace, files]) => [
      workspace,
      files.some(f => f.startsWith('.changeset/')),
    ]),
  );

  // If all packages have a changeset already then exit early.
  if (
    !changedWorkspacesWithChangeset.size ||
    Array.from(changedWorkspacesWithChangeset.values()).every(v => v)
  ) {
    core.info(
      'No changesets to create, or all workspaces have changesets already',
    );
    return;
  }

  // Get all package.jsons that were changed
  const changedPackageJsons = new Map<
    string,
    {
      path: string;
      localPath: string;
      packageJson: { name: string; version: string };
    }[]
  >(
    Array.from(changedFilesByWorkspace.entries())
      .map(([workspace, files]) => [
        workspace,
        // Ignore root package.json from the workspace, and check for package.json in the subfolders
        files.filter(f => f !== 'package.json' && f.endsWith('package.json')),
      ])
      .filter((workspaceChanges): workspaceChanges is [string, string[]] => {
        const [_, files] = workspaceChanges;
        return files.length > 0;
      })
      .map(([workspace, files]) => [
        workspace,
        files.map(f => ({
          path: f,
          localPath: relativePath(process.cwd(), resolvePath(workspace, f)),
          packageJson: require(resolvePath(workspace, f)),
        })),
      ]),
  );

  if (!changedPackageJsons.size) {
    core.info('Seems that no package.jsons were changed in this PR');
    return;
  }

  // Get the bumps that happened in the last commit made by rennovate in the diff
  const bumps = await Promise.all(
    Array.from(changedPackageJsons.entries()).map(
      async ([workspace, packages]) => {
        const changes = await getBumps(
          packages.map(p => p.localPath),
          excludeDevDependencies,
        );

        return {
          workspace,
          packages,
          changes,
        };
      },
    ),
  );

  // Filter out bumps where `changes` is empty
  const filteredBumps = bumps.filter(({ changes }) => changes.size > 0);

  // filteredBumps can be empty if all changes in package.json are related to devDependencies and excludeDevDependencies is false
  if (filteredBumps.length === 0) {
    core.info('Seems that only devDependencies were added');
    return;
  }
  const changesetFilename = await getChangesetFilename();
  const changesetFiles: string[] = [];

  // Create a changeset for each of the workspaces in the right place
  for (const bump of filteredBumps) {
    const changesetFilePath = resolvePath(bump.workspace, changesetFilename);
    changesetFiles.push(changesetFilePath);

    await createChangeset(
      changesetFilePath,
      bump.changes,
      bump.packages.map(p => p.packageJson.name),
    );
  }

  // Commit and push all the changesets.
  await commitAndPush(changesetFiles);
}

main().catch(error => {
  core.error(error.stack);
  core.setFailed(String(error));
  process.exit(1);
});
