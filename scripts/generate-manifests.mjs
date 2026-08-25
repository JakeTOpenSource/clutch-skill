#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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
  return paths.map(receipt).sort((left, right) => left.path.localeCompare(right.path));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const canonicalSkillPath = join(root, "clutch", "SKILL.md");
const humanSkillPath = join(root, "Clutch-Skill.md");
const canonicalSkill = readFileSync(canonicalSkillPath, "utf8");
const humanSkill = canonicalSkill.replaceAll("](references/", "](clutch/references/");
writeFileSync(humanSkillPath, humanSkill, "utf8");

const implementationPaths = [
  join(root, "AGENTS.example.md"),
  humanSkillPath,
  join(root, "model-map.example.json"),
  join(root, "scripts", "generate-manifests.mjs"),
  join(root, "scripts", "install-skill.mjs"),
  join(root, "scripts", "recompute-evaluation.mjs"),
  join(root, "scripts", "repeatability-core.mjs"),
  join(root, "scripts", "verify-evaluation.mjs"),
  join(root, "scripts", "verify-portability.mjs"),
  join(root, "scripts", "verify-repeatability.mjs"),
  join(root, "scripts", "verify-release.mjs"),
  ...walkFiles(join(root, "adapters")),
  ...walkFiles(join(root, "clutch")),
];

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
policy.policy_id = `clutch-policy-v2@${implementationDigest}`;
writeJson(policyPath, policy);

const excludedReleasePaths = new Set(["release-manifest.json"]);
const releasePaths = walkFiles(root).filter((path) => !excludedReleasePaths.has(portablePath(path)));
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
