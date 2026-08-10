import { cp, lstat, mkdir, readlink, readdir, symlink, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const appRoot = process.cwd();
const standaloneRoot = join(
  appRoot,
  ".next",
  "standalone",
  "apps",
  "web",
);

await mkdir(join(standaloneRoot, ".next"), { recursive: true });
await cp(
  join(appRoot, ".next", "static"),
  join(standaloneRoot, ".next", "static"),
  { recursive: true, force: true },
);

const publicDir = join(appRoot, "public");
if (existsSync(publicDir)) {
  await cp(publicDir, join(standaloneRoot, "public"), {
    recursive: true,
    force: true,
  });
}

// Next.js preserves pnpm's relative directory links in standalone output. On
// Windows they can be emitted as file-type symlinks, which Node cannot follow.
// Convert only directory targets to junctions; Linux deployments keep the
// original links unchanged.
if (process.platform === "win32") {
  await materializeDirectoryLinks(join(appRoot, ".next", "standalone"));
}

async function materializeDirectoryLinks(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      const target = await readlink(entryPath);
      const targetPath = resolve(dirname(entryPath), target);
      const targetStats = await lstat(targetPath);

      if (targetStats.isDirectory()) {
        await unlink(entryPath);
        await symlink(targetPath, entryPath, "junction");
      }

      continue;
    }

    if (entry.isDirectory()) {
      await materializeDirectoryLinks(entryPath);
    }
  }
}
