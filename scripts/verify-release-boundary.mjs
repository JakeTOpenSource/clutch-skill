#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function assertSafeTemporaryRoot(path) {
  const relation = relative(resolve(tmpdir()), resolve(path));
  assert.ok(
    relation !== "" &&
    relation !== ".." &&
    !relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(relation),
    "Refusing unsafe temporary cleanup",
  );
}

function copyCandidate(parent, name) {
  const target = join(parent, name);
  cpSync(sourceRoot, target, {
    recursive: true,
    filter: (source) => {
      const base = source.split(/[\\/]/).at(-1);
      return base !== ".git" && base !== "node_modules";
    },
  });
  return target;
}

function runGenerator(root) {
  return spawnSync(process.execPath, [join(root, "scripts", "generate-manifests.mjs")], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "clutch-release-boundary-"));
try {
  const unexpectedRoot = copyCandidate(temporaryRoot, "unexpected-file");
  mkdirSync(join(unexpectedRoot, ".clutch-trial"));
  writeFileSync(join(unexpectedRoot, ".clutch-trial", "stderr.txt"), "PRIVATE_CANARY_RELEASE_ARTIFACT\n", "utf8");
  const unexpected = runGenerator(unexpectedRoot);
  assert.notEqual(unexpected.status, 0, "Manifest generation accepted an unallowlisted trial artifact");
  assert.match(unexpected.stderr, /Repository contains a missing or unallowlisted release file/);

  const missingRoot = copyCandidate(temporaryRoot, "missing-file");
  unlinkSync(join(missingRoot, "README.md"));
  const missing = runGenerator(missingRoot);
  assert.notEqual(missing.status, 0, "Manifest generation accepted a missing allowlisted file");
  assert.match(missing.stderr, /Repository contains a missing or unallowlisted release file/);

  process.stdout.write([
    "CLUTCH RELEASE BOUNDARY VERIFY PASS",
    "unallowlisted_trial_rejection=PASS",
    "missing_file_rejection=PASS",
    "claim_ceiling=TEMPORARY_LOCAL_RELEASE_SET_MUTATIONS_ONLY",
  ].join("\n") + "\n");
} finally {
  assertSafeTemporaryRoot(temporaryRoot);
  rmSync(temporaryRoot, { force: true, recursive: true });
}
