#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { appendFileSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { installSkill, treeReceipt } from "./install-skill.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const targetMap = JSON.parse(readFileSync(join(root, "adapters", "harness-targets.json"), "utf8"));
const canonical = treeReceipt(join(root, "clutch"));
const temporaryRoot = mkdtempSync(join(tmpdir(), "clutch-portability-"));

function expectCode(code, operation) {
  assert.throws(operation, (error) => error?.code === code, `Expected ${code}`);
}

try {
  assert.equal(targetMap.schema_version, "clutch-harness-targets.v1");
  assert.equal(targetMap.status, "REFERENCE_NOT_ACTIVATED");
  assert.equal(targetMap.skill_name, "clutch");
  assert.deepEqual(targetMap.targets["agent-skills-shared"].harnesses, ["codex", "github-copilot", "cursor", "gemini-cli"]);
  assert.equal(targetMap.targets["agent-skills-shared"].project_path, ".agents/skills/clutch");
  assert.deepEqual(targetMap.targets["claude-code"].harnesses, ["claude-code"]);
  assert.equal(targetMap.targets["claude-code"].project_path, ".claude/skills/clutch");

  for (const harness of ["codex", "github-copilot", "cursor", "gemini-cli", "claude-code"]) {
    const project = join(temporaryRoot, harness);
    mkdirSync(project, { recursive: true });
    const installed = installSkill({ harness, projectPath: project });
    assert.equal(installed.status, "INSTALLED");
    assert.equal(isAbsolute(installed.destination), true);
    assert.deepEqual(treeReceipt(installed.destination), canonical);
    assert.equal(installSkill({ check: true, harness, projectPath: project }).status, "CHECK_PASS");
    assert.equal(installSkill({ harness, projectPath: project }).status, "ALREADY_CURRENT");
  }

  const dryProject = join(temporaryRoot, "dry-run");
  mkdirSync(dryProject, { recursive: true });
  const dryRun = installSkill({ dryRun: true, harness: "codex", projectPath: dryProject });
  assert.equal(dryRun.status, "DRY_RUN");
  assert.equal(existsSync(dryRun.destination), false);

  const lockedProject = join(temporaryRoot, "locked");
  const lockedParent = join(lockedProject, ".agents", "skills");
  mkdirSync(lockedParent, { recursive: true });
  const lockPath = join(lockedParent, ".clutch-install.lock");
  const lockHandle = openSync(lockPath, "wx");
  try {
    expectCode("INSTALL_LOCKED", () => installSkill({ harness: "codex", projectPath: lockedProject }));
  } finally {
    closeSync(lockHandle);
    unlinkSync(lockPath);
  }

  const customProject = join(temporaryRoot, "custom");
  mkdirSync(customProject, { recursive: true });
  const custom = installSkill({ destination: ".portable/skills/clutch", harness: "custom", projectPath: customProject });
  assert.equal(custom.status, "INSTALLED");
  assert.equal(relative(customProject, custom.destination).replaceAll("\\", "/"), ".portable/skills/clutch");
  assert.deepEqual(treeReceipt(custom.destination), canonical);

  expectCode("PATH_ESCAPE", () => installSkill({ destination: "../escape/clutch", dryRun: true, harness: "custom", projectPath: customProject }));
  expectCode("DESTINATION_INVALID", () => installSkill({ destination: ".portable/skills/not-clutch", dryRun: true, harness: "custom", projectPath: customProject }));
  expectCode("UNKNOWN_HARNESS", () => installSkill({ dryRun: true, harness: "unknown", projectPath: customProject }));

  const driftProject = join(temporaryRoot, "drift");
  mkdirSync(driftProject, { recursive: true });
  const drifted = installSkill({ harness: "codex", projectPath: driftProject });
  appendFileSync(join(drifted.destination, "SKILL.md"), "\nLOCAL DRIFT\n", "utf8");
  expectCode("INSTALL_DRIFT", () => installSkill({ check: true, harness: "codex", projectPath: driftProject }));
  expectCode("DESTINATION_CONFLICT", () => installSkill({ harness: "codex", projectPath: driftProject }));

  process.stdout.write([
    "PORTABILITY VERIFY PASS",
    "canonical_skill=Agent Skills folder",
    "shared_project_target=.agents/skills/clutch",
    "claude_project_target=.claude/skills/clutch",
    "documented_harnesses=5",
    "custom_target=PASS",
    "dry_run=PASS",
    "idempotent_install=PASS",
    "lock_contention_rejection=PASS",
    "drift_rejection=PASS",
    "path_escape_rejection=PASS",
  ].join("\n") + "\n");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
