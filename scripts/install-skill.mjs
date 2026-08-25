#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import {
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalSkillRoot = join(root, "clutch");
const targetMap = JSON.parse(readFileSync(join(root, "adapters", "harness-targets.json"), "utf8"));

function codedError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function portable(path) {
  return path.replaceAll("\\", "/");
}

function relationStaysInside(base, candidate) {
  const relation = relative(base, candidate);
  return relation === "" || (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`));
}

function nearestExistingAncestor(path) {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) throw codedError("PROJECT_PATH_INVALID", `No existing ancestor for ${path}`);
    current = parent;
  }
  return current;
}

export function treeReceipt(directory) {
  const rootPath = resolve(directory);
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw codedError("TREE_NOT_FOUND", `Directory not found: ${directory}`);
  }
  const files = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw codedError("SYMLINK_UNSUPPORTED", `Symbolic links are not copied: ${path}`);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile()) throw codedError("UNSUPPORTED_ENTRY", `Unsupported filesystem entry: ${path}`);
      const bytes = readFileSync(path);
      files.push({
        path: portable(relative(rootPath, path)),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  walk(rootPath);
  files.sort((left, right) => left.path === right.path ? 0 : left.path < right.path ? -1 : 1);
  return {
    digest: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}

function sameTree(left, right) {
  return JSON.stringify(left.files) === JSON.stringify(right.files);
}

export function resolveInstallTarget({ destination, harness, projectPath = process.cwd() }) {
  if (!harness || typeof harness !== "string") throw codedError("HARNESS_REQUIRED", "Choose a harness or use 'custom'");
  const projectCandidate = resolve(projectPath);
  if (!existsSync(projectCandidate) || !statSync(projectCandidate).isDirectory()) {
    throw codedError("PROJECT_PATH_INVALID", `Project directory not found: ${projectPath}`);
  }
  const project = realpathSync(projectCandidate);
  const normalizedHarness = harness.trim().toLowerCase();

  let relativeDestination;
  let targetId;
  if (normalizedHarness === "custom") {
    if (!destination) throw codedError("DESTINATION_REQUIRED", "Custom installs require --destination");
    relativeDestination = destination;
    targetId = "custom";
  } else {
    if (destination) throw codedError("DESTINATION_NOT_ALLOWED", "Use --destination only with --harness custom");
    targetId = targetMap.aliases[normalizedHarness];
    if (!targetId || !targetMap.targets[targetId]) {
      throw codedError("UNKNOWN_HARNESS", `Unsupported harness alias: ${harness}`);
    }
    relativeDestination = targetMap.targets[targetId].project_path;
  }

  if (typeof relativeDestination !== "string" || relativeDestination.trim() === "" || relativeDestination.includes("\0") || isAbsolute(relativeDestination) || /^[A-Za-z]:[\\/]/.test(relativeDestination)) {
    throw codedError("DESTINATION_INVALID", "Destination must be a non-empty project-relative path");
  }
  const target = resolve(project, ...relativeDestination.split(/[\\/]+/));
  if (!relationStaysInside(project, target)) throw codedError("PATH_ESCAPE", "Destination escapes the selected project");
  if (basename(target) !== targetMap.skill_name) {
    throw codedError("DESTINATION_INVALID", `Destination must end in /${targetMap.skill_name}`);
  }

  const existingAncestor = realpathSync(nearestExistingAncestor(dirname(target)));
  if (!relationStaysInside(project, existingAncestor)) {
    throw codedError("PATH_ESCAPE", "An existing destination ancestor resolves outside the selected project");
  }
  return {
    destination: target,
    harness: normalizedHarness,
    project,
    projectRelativeDestination: portable(relative(project, target)),
    targetId,
  };
}

export function installSkill({ check = false, destination, dryRun = false, harness, projectPath = process.cwd() }) {
  if (check && dryRun) throw codedError("MODE_CONFLICT", "--check and --dry-run cannot be combined");
  const target = resolveInstallTarget({ destination, harness, projectPath });
  const canonical = treeReceipt(canonicalSkillRoot);

  if (existsSync(target.destination)) {
    if (lstatSync(target.destination).isSymbolicLink()) {
      throw codedError("SYMLINK_UNSUPPORTED", "The destination may not be a symbolic link");
    }
    if (!statSync(target.destination).isDirectory()) {
      throw codedError("DESTINATION_CONFLICT", "The destination exists and is not a directory");
    }
    const installed = treeReceipt(target.destination);
    if (!sameTree(canonical, installed)) {
      throw codedError(check ? "INSTALL_DRIFT" : "DESTINATION_CONFLICT", "The existing skill differs from the canonical source; no files were overwritten");
    }
    return {
      ...target,
      digest: canonical.digest,
      fileCount: canonical.files.length,
      status: check ? "CHECK_PASS" : "ALREADY_CURRENT",
    };
  }

  if (check) throw codedError("NOT_INSTALLED", `No skill is installed at ${target.projectRelativeDestination}`);
  if (dryRun) {
    return {
      ...target,
      digest: canonical.digest,
      fileCount: canonical.files.length,
      status: "DRY_RUN",
    };
  }

  const parent = dirname(target.destination);
  mkdirSync(parent, { recursive: true });
  const realParent = realpathSync(parent);
  if (!relationStaysInside(target.project, realParent)) {
    throw codedError("PATH_ESCAPE", "The destination parent resolves outside the selected project");
  }

  const lockPath = join(realParent, ".clutch-install.lock");
  let lockHandle;
  try {
    lockHandle = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") throw codedError("INSTALL_LOCKED", "Another install may be using this skill directory; verify it has stopped before removing a stale lock");
    throw error;
  }

  let wrapper;
  try {
    if (existsSync(target.destination)) {
      if (lstatSync(target.destination).isSymbolicLink() || !statSync(target.destination).isDirectory()) {
        throw codedError("DESTINATION_CONFLICT", "The destination appeared during installation and was not changed");
      }
      const installed = treeReceipt(target.destination);
      if (!sameTree(canonical, installed)) {
        throw codedError("DESTINATION_CONFLICT", "A differing destination appeared during installation and was not changed");
      }
      return {
        ...target,
        digest: canonical.digest,
        fileCount: canonical.files.length,
        status: "ALREADY_CURRENT",
      };
    }

    wrapper = mkdtempSync(join(realParent, ".clutch-install-"));
    const staged = join(wrapper, targetMap.skill_name);
    cpSync(canonicalSkillRoot, staged, { errorOnExist: true, recursive: true });
    const stagedReceipt = treeReceipt(staged);
    if (!sameTree(canonical, stagedReceipt)) throw codedError("STAGING_MISMATCH", "The staged skill differs from the canonical source");
    if (existsSync(target.destination)) throw codedError("DESTINATION_RACE", "The destination appeared before commit and was not changed");
    renameSync(staged, target.destination);
  } finally {
    if (wrapper) rmSync(wrapper, { force: true, recursive: true });
    closeSync(lockHandle);
    unlinkSync(lockPath);
  }

  const installed = treeReceipt(target.destination);
  if (!sameTree(canonical, installed)) throw codedError("INSTALL_MISMATCH", "The installed skill differs from the canonical source");
  return {
    ...target,
    digest: canonical.digest,
    fileCount: canonical.files.length,
    status: "INSTALLED",
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/install-skill.mjs --harness <name> [--project <directory>]",
    "  node scripts/install-skill.mjs --harness <name> [--project <directory>] --check",
    "  node scripts/install-skill.mjs --harness <name> [--project <directory>] --dry-run",
    "  node scripts/install-skill.mjs --harness custom --destination <relative/path/clutch> [--project <directory>]",
    "",
    "Known names: codex, github-copilot, cursor, gemini-cli, claude-code, shared, custom",
    "Serialized local installs use an exclusive lock and never overwrite known drift.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (["--destination", "--harness", "--project"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw codedError("ARGUMENT_REQUIRED", `${argument} requires a value`);
      if (argument === "--destination") options.destination = value;
      if (argument === "--harness") options.harness = value;
      if (argument === "--project") options.projectPath = value;
      index += 1;
    } else {
      throw codedError("UNKNOWN_ARGUMENT", `Unknown argument: ${argument}`);
    }
  }
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const outcome = installSkill(options);
    process.stdout.write([
      `CLUTCH INSTALL ${outcome.status}`,
      `harness=${outcome.harness}`,
      `target=${outcome.projectRelativeDestination}`,
      `files=${outcome.fileCount}`,
      `digest=${outcome.digest}`,
    ].join("\n") + "\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main();
