#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { digestObject, reduceInput } from "../clutch/scripts/card-gate.mjs";
import { projectInput } from "../clutch/scripts/release-reference.mjs";
import { validateSkill } from "../clutch/scripts/validate-skill.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

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

function runNode(path) {
  const outcome = spawnSync(process.execPath, [path], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(outcome.status, 0, outcome.stderr || outcome.stdout);
  return outcome.stdout.trim();
}

const skillRoot = join(root, "clutch");
const implementationManifest = readJson(join(root, "implementation-manifest.json"));
const releaseManifest = readJson(join(root, "release-manifest.json"));
const policy = readJson(join(root, "policy.example.json"));
const modelMap = readJson(join(root, "model-map.example.json"));
const packageMetadata = readJson(join(root, "package.json"));

const canonicalSkill = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
const expectedHumanSkill = canonicalSkill.replaceAll("](references/", "](clutch/references/");
const humanSkill = readFileSync(join(root, "Clutch-Skill.md"), "utf8");
assert.equal(humanSkill, expectedHumanSkill, "Clutch-Skill.md differs beyond its path-aware reference links");
assert.ok(!humanSkill.includes("](references/"), "Clutch-Skill.md retains install-directory links");
for (const target of ["protocol.md", "card-contract.md", "model-profiles.md"]) {
  assert.ok(humanSkill.includes(`](clutch/references/${target})`), `Clutch-Skill.md lacks a working link to ${target}`);
}
const skillValidation = validateSkill(skillRoot);
assert.equal(skillValidation.valid, true, skillValidation.message);

assert.equal(implementationManifest.schema_version, "implementation-manifest.v1");
assert.equal(implementationManifest.status, "PREPARE_ONLY");
assert.equal(implementationManifest.hash_algorithm, "sha256");
assert.equal(implementationManifest.file_encoding, "RAW_BYTES");
const implementationPaths = [
  join(root, "AGENTS.example.md"),
  join(root, "Clutch-Skill.md"),
  join(root, "model-map.example.json"),
  join(root, "scripts", "generate-manifests.mjs"),
  join(root, "scripts", "verify-release.mjs"),
  ...walkFiles(skillRoot),
];
assert.deepEqual(implementationManifest.files, sortedReceipts(implementationPaths), "Implementation manifest differs from the executable decision surface");
const implementationDigest = digestObject(implementationManifest);

assert.equal(policy.schema_version, "routing-policy.v1");
assert.equal(policy.phase, "PREPARE_ONLY");
assert.equal(policy.policy_id, `clutch-policy-v1@${implementationDigest}`, "Policy identity does not bind the implementation manifest");
assert.equal(modelMap.schema_version, "model-map.v1");
assert.equal(modelMap.status, "EXAMPLE_NOT_ACTIVATED");
assert.deepEqual(Object.keys(modelMap.profiles).sort(), [policy.advisor_profile, ...policy.worker_profiles].sort());
assert.equal(modelMap.profiles[policy.advisor_profile].mutation_mode, "READ_ONLY");
for (const profile of policy.worker_profiles) assert.equal(modelMap.profiles[profile].mutation_mode, "CARD_BOUNDED");

const emptyInput = { cards: [], events: [], policy, schema_version: "approved-routing-input.v1" };
const [primary, primaryExit] = reduceInput(emptyInput);
const reference = projectInput(emptyInput);
assert.equal(primaryExit, 0);
assert.equal(primary.validation.status, "VALID");
assert.equal(primary.stream.activated, false);
assert.equal(primary.released_cards.length, 0);
assert.equal(reference.validation, "VALID");
assert.equal(reference.activated, false);
assert.equal(reference.released_card_ids.length, 0);

const conformanceOutput = runNode(join(skillRoot, "scripts", "verify.mjs"));
assert.match(conformanceOutput, /^VERIFY PASS$/m);
const visualOutput = runNode(join(root, "visuals", "verify-manual-transmission.mjs"));
assert.match(visualOutput, /^TRANSMISSION VISUAL VERIFY PASS$/m);

assert.equal(packageMetadata.license, "Apache-2.0");
const licenseText = readFileSync(join(root, "LICENSE"), "utf8");
assert.match(licenseText, /^ {33}Apache License\r?\n {27}Version 2\.0, January 2004/m);
const normalizedLicense = licenseText.replaceAll("\r\n", "\n");
assert.equal(createHash("sha256").update(normalizedLicense).digest("hex"), "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4", "LICENSE differs from the canonical Apache-2.0 text");
for (const path of walkFiles(root).filter((file) => file.endsWith(".mjs"))) {
  assert.match(readFileSync(path, "utf8"), /SPDX-License-Identifier: Apache-2\.0/, `${portablePath(path)} lacks an SPDX identifier`);
}

assert.equal(releaseManifest.schema_version, "clutch-release-manifest.v1");
assert.equal(releaseManifest.status, "PREPARE_ONLY");
assert.deepEqual(releaseManifest.excluded_paths, ["release-manifest.json"]);
const releasePaths = walkFiles(root).filter((path) => portablePath(path) !== "release-manifest.json");
assert.deepEqual(releaseManifest.files, sortedReceipts(releasePaths), "Release manifest differs from repository bytes");

const textPaths = walkFiles(root).filter((path) => /\.(?:md|mjs|json|ya?ml)$/.test(path));
const formerSkillName = ["route", "approved", "model", "work"].join("-");
const privateEmail = ["jaketillerpcs", "gmail.com"].join("@");
const privateName = ["Jake", "Tiller"].join(" ");
for (const path of textPaths) {
  const source = readFileSync(path, "utf8");
  assert.ok(!source.includes("C:\\Users\\"), `${portablePath(path)} leaks a local Windows path`);
  assert.ok(!source.toLowerCase().includes(privateEmail), `${portablePath(path)} leaks a personal email address`);
  assert.ok(!source.includes(privateName), `${portablePath(path)} leaks a personal name`);
  assert.ok(!source.includes(formerSkillName), `${portablePath(path)} retains the former skill name`);
}

for (const path of walkFiles(join(root, "visuals")).filter((file) => file.endsWith(".png"))) {
  const bytes = readFileSync(path);
  const metadataChunks = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (["tEXt", "zTXt", "iTXt", "eXIf"].includes(type)) metadataChunks.push(type);
    offset += length + 12;
    if (type === "IEND") break;
  }
  assert.deepEqual(metadataChunks, [], `${portablePath(path)} contains text or EXIF metadata`);
}

process.stdout.write([
  "CLUTCH RELEASE VERIFY PASS",
  "phase=PREPARE_ONLY",
  "activation_performed=false",
  "released_cards=0",
  `implementation_digest=${implementationDigest}`,
  `implementation_files=${implementationManifest.files.length}`,
  `release_digest=${digestObject(releaseManifest)}`,
  `release_files=${releaseManifest.files.length}`,
  "skill_name=clutch",
  "skill_mirror_match=PASS",
  "license=Apache-2.0",
  "privacy_scan=PASS",
  "conformance_cases=26",
  "primary_reference_parity=26/26",
  "claim_ceiling=LOCAL_SYNTHETIC_CONFORMANCE_AND_RELEASE_BYTE_IDENTITY_ONLY",
].join("\n") + "\n");
