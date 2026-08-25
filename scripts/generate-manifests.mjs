#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { digestObject } from "../clutch/scripts/card-gate.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function portablePath(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function receipt(path) {
  const bytes = readFileSync(path);
  return {
    path: portablePath(path),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function sortedReceipts(paths) {
  return paths.map(receipt).sort((left, right) => left.path === right.path ? 0 : left.path < right.path ? -1 : 1);
}

function sortedUnique(values, label) {
  assert.ok(Array.isArray(values) && values.length > 0, `${label} must be a nonempty array`);
  const sorted = [...values].sort();
  assert.equal(new Set(sorted).size, sorted.length, `${label} contains duplicates`);
  assert.deepEqual(values, sorted, `${label} must be sorted`);
  return sorted;
}

function resolveAllowlistedPath(portable, label) {
  assert.equal(typeof portable, "string", `${label} contains a non-string path`);
  assert.ok(portable.length > 0 && !portable.includes("\\") && !isAbsolute(portable), `${label} contains a non-portable path: ${portable}`);
  const absolute = resolve(root, portable);
  const relation = relative(root, absolute);
  assert.ok(relation !== "" && relation !== ".." && !relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(relation), `${label} escapes the repository: ${portable}`);
  assert.ok(statSync(absolute).isFile(), `${label} does not name a file: ${portable}`);
  return absolute;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const canonicalSkillPath = join(root, "clutch", "SKILL.md");
const humanSkillPath = join(root, "Clutch-Skill.md");
const canonicalSkill = readFileSync(canonicalSkillPath, "utf8");
const humanSkill = canonicalSkill.replaceAll("](references/", "](clutch/references/");
writeFileSync(humanSkillPath, humanSkill, "utf8");

const allowlist = JSON.parse(readFileSync(join(root, "release-files.json"), "utf8"));
assert.equal(allowlist.schema_version, "clutch-release-allowlist.v1");
assert.equal(allowlist.status, "PREPARE_ONLY");
const allowedReleaseFiles = sortedUnique(allowlist.release_files, "release_files");
const allowedImplementationFiles = sortedUnique(allowlist.implementation_files, "implementation_files");
for (const path of allowedImplementationFiles) {
  assert.ok(allowedReleaseFiles.includes(path), `Implementation file is not release-allowlisted: ${path}`);
}
const actualReleaseFiles = walkFiles(root)
  .map(portablePath)
  .filter((path) => path !== "release-manifest.json")
  .sort();
assert.deepEqual(actualReleaseFiles, allowedReleaseFiles, "Repository contains a missing or unallowlisted release file");

const implementationPaths = allowedImplementationFiles.map((path) => resolveAllowlistedPath(path, "implementation_files"));

const implementationManifest = {
  schema_version: "implementation-manifest.v1",
  status: "PREPARE_ONLY",
  hash_algorithm: "sha256",
  file_encoding: "RAW_BYTES",
  files: sortedReceipts(implementationPaths),
};
writeJson(join(root, "implementation-manifest.json"), implementationManifest);

const implementationDigest = digestObject(implementationManifest);
const policyPath = join(root, "policy.example.json");
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
policy.schema_version = "routing-policy.v3";
policy.implementation_digest = implementationDigest;
policy.policy_id = `clutch-policy-v3@${implementationDigest}`;
writeJson(policyPath, policy);

const excludedReleasePaths = new Set(["release-manifest.json"]);
const releasePaths = allowedReleaseFiles.map((path) => resolveAllowlistedPath(path, "release_files"));
const releaseManifest = {
  schema_version: "clutch-release-manifest.v1",
  status: "PREPARE_ONLY",
  hash_algorithm: "sha256",
  file_encoding: "RAW_BYTES",
  excluded_paths: [...excludedReleasePaths].sort(),
  files: sortedReceipts(releasePaths),
};
writeJson(join(root, "release-manifest.json"), releaseManifest);

process.stdout.write([
  "MANIFEST REFRESH PASS",
  `implementation_digest=${implementationDigest}`,
  `implementation_files=${implementationManifest.files.length}`,
  `release_digest=${digestObject(releaseManifest)}`,
  `release_files=${releaseManifest.files.length}`,
  "phase=PREPARE_ONLY",
].join("\n") + "\n");
