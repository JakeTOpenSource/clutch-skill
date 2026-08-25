#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { digestObject, eventDigest, reduceInput } from "../clutch/scripts/card-gate.mjs";
import { reduceFuseInput } from "../clutch/scripts/fuse-gate.mjs";
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
  return paths.map(receipt).sort((left, right) => left.path === right.path ? 0 : left.path < right.path ? -1 : 1);
}

function firstPathSetProblem(actual, allowed) {
  const actualSet = new Set(actual);
  const allowedSet = new Set(allowed);
  for (const path of [...actualSet].sort()) {
    if (!allowedSet.has(path)) return `UNALLOWLISTED_RELEASE_FILE:${path}`;
  }
  for (const path of [...allowedSet].sort()) {
    if (!actualSet.has(path)) return `MISSING_RELEASE_FILE:${path}`;
  }
  return null;
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
const releaseAllowlist = readJson(join(root, "release-files.json"));
const policy = readJson(join(root, "policy.example.json"));
const modelMap = readJson(join(root, "model-map.example.json"));
const harnessTargets = readJson(join(root, "adapters", "harness-targets.json"));
const packageMetadata = readJson(join(root, "package.json"));

const canonicalSkill = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
const expectedHumanSkill = canonicalSkill.replaceAll("](references/", "](clutch/references/");
const humanSkill = readFileSync(join(root, "Clutch-Skill.md"), "utf8");
assert.equal(humanSkill, expectedHumanSkill, "Clutch-Skill.md differs beyond its path-aware reference links");
assert.ok(!humanSkill.includes("](references/"), "Clutch-Skill.md retains install-directory links");
for (const target of ["protocol.md", "fuse-protocol.md", "card-contract.md", "model-profiles.md", "host-integration.md"]) {
  assert.ok(humanSkill.includes(`](clutch/references/${target})`), `Clutch-Skill.md lacks a working link to ${target}`);
}
const skillValidation = validateSkill(skillRoot);
assert.equal(skillValidation.valid, true, skillValidation.message);

assert.equal(harnessTargets.schema_version, "clutch-harness-targets.v1");
assert.equal(harnessTargets.status, "REFERENCE_NOT_ACTIVATED");
assert.equal(harnessTargets.skill_name, "clutch");
assert.equal(harnessTargets.targets["agent-skills-shared"].project_path, ".agents/skills/clutch");
assert.deepEqual(harnessTargets.targets["agent-skills-shared"].harnesses, ["codex", "github-copilot", "cursor", "gemini-cli"]);
assert.equal(harnessTargets.targets["claude-code"].project_path, ".claude/skills/clutch");
assert.deepEqual(harnessTargets.targets["claude-code"].harnesses, ["claude-code"]);
for (const targetId of Object.values(harnessTargets.aliases)) {
  assert.ok(Object.hasOwn(harnessTargets.targets, targetId), `Harness alias points to unknown target: ${targetId}`);
}

assert.equal(implementationManifest.schema_version, "implementation-manifest.v1");
assert.equal(implementationManifest.status, "PREPARE_ONLY");
assert.equal(implementationManifest.hash_algorithm, "sha256");
assert.equal(implementationManifest.file_encoding, "RAW_BYTES");
assert.equal(releaseAllowlist.schema_version, "clutch-release-allowlist.v1");
assert.equal(releaseAllowlist.status, "PREPARE_ONLY");
assert.deepEqual(releaseAllowlist.release_files, [...releaseAllowlist.release_files].sort(), "Release allowlist is not sorted");
assert.deepEqual(releaseAllowlist.implementation_files, [...releaseAllowlist.implementation_files].sort(), "Implementation allowlist is not sorted");
assert.equal(new Set(releaseAllowlist.release_files).size, releaseAllowlist.release_files.length, "Release allowlist contains duplicates");
assert.equal(new Set(releaseAllowlist.implementation_files).size, releaseAllowlist.implementation_files.length, "Implementation allowlist contains duplicates");
for (const path of releaseAllowlist.implementation_files) {
  assert.ok(releaseAllowlist.release_files.includes(path), `Implementation file is not release-allowlisted: ${path}`);
}
const implementationPaths = releaseAllowlist.implementation_files.map((path) => join(root, ...path.split("/")));
assert.deepEqual(implementationManifest.files, sortedReceipts(implementationPaths), "Implementation manifest differs from the executable decision surface");
const implementationDigest = digestObject(implementationManifest);

assert.equal(policy.schema_version, "routing-policy.v3");
assert.equal(policy.phase, "PREPARE_ONLY");
assert.equal(policy.implementation_digest, implementationDigest, "Policy does not declare the implementation manifest digest");
assert.equal(policy.policy_id, `clutch-policy-v3@${implementationDigest}`, "Policy identity does not bind the implementation manifest");
assert.deepEqual(policy.human_actor_ids, ["owner"]);
assert.deepEqual(policy.advisor_actor_ids, ["role-model"]);
assert.deepEqual(policy.orchestrator_actor_ids, ["orchestrator"]);
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
assert.equal(reference.released_card_hashes.length, 0);

const conformanceSuite = readJson(join(skillRoot, "scripts", "fixtures", "conformance-cases.json"));
const callerSuppliedBinding = structuredClone(conformanceSuite.cases.find((entry) => entry.case_id === "active-approved-released").input);
callerSuppliedBinding.policy.implementation_digest = `sha256:${"2".repeat(64)}`;
callerSuppliedBinding.policy.policy_id = `clutch-policy-v3@${callerSuppliedBinding.policy.implementation_digest}`;
let callerPreviousHash = null;
for (const event of callerSuppliedBinding.events) {
  event.previous_hash = callerPreviousHash;
  if (event.event_type === "SYSTEM_ACTIVATED") {
    event.implementation_digest = callerSuppliedBinding.policy.implementation_digest;
    event.policy_hash = digestObject(callerSuppliedBinding.policy);
  }
  event.event_hash = eventDigest(event);
  callerPreviousHash = event.event_hash;
}
const [callerBindingReport, callerBindingExit] = reduceInput(callerSuppliedBinding);
assert.equal(callerBindingExit, 0, "Self-consistent caller-supplied implementation binding should expose the documented host boundary");
assert.equal(callerBindingReport.released_cards.length, 1, "Caller-supplied binding boundary fixture should remain eligible");

const conformanceOutput = runNode(join(skillRoot, "scripts", "verify.mjs"));
assert.match(conformanceOutput, /^VERIFY PASS$/m);
assert.match(conformanceOutput, /^worker_failure_cannot_be_verified_pass=PASS$/m);
assert.match(conformanceOutput, /^verified_non_delivery_can_close=PASS$/m);
const fuseOutput = runNode(join(skillRoot, "scripts", "verify-fuses.mjs"));
assert.match(fuseOutput, /^FUSE VERIFY PASS$/m);
assert.match(fuseOutput, /^cases=48$/m);
assert.match(fuseOutput, /^valid_cases=19$/m);
assert.match(fuseOutput, /^hostile_cases=29$/m);
assert.match(fuseOutput, /^phase_mismatch_recovery=PASS$/m);
assert.match(fuseOutput, /^failed_phase_delivery_credit=0$/m);
const fuseExample = readJson(join(root, "examples", "fuse-input.example.json"));
const [fuseExampleReport, fuseExampleExit] = reduceFuseInput(fuseExample);
assert.equal(fuseExampleExit, 0, "Executable Fuse example must remain valid");
assert.equal(fuseExampleReport.stream.state, "DELIVERABLE");
assert.equal(fuseExampleReport.feedback.length, 1);
assert.equal(fuseExampleReport.usage.delivery_units, 1);
const evaluationOutput = runNode(join(root, "evaluation", "scripts", "verify-evaluation.mjs"));
assert.match(evaluationOutput, /^CLUTCH EVALUATION VERIFY PASS$/m);
assert.match(evaluationOutput, /^pilot_efficiency_winner=NOT_AUTHORIZED_QUALITY_BAR$/m);
const liveTelemetryAuthorizationOutput = runNode(join(root, "evaluation", "scripts", "verify-live-telemetry-authorization.mjs"));
assert.match(liveTelemetryAuthorizationOutput, /^CLUTCH LIVE TELEMETRY AUTHORIZATION VERIFY PASS$/m);
assert.match(liveTelemetryAuthorizationOutput, /^stage0_model_run_authorized=false$/m);
const releaseBoundaryOutput = runNode(join(root, "scripts", "verify-release-boundary.mjs"));
assert.match(releaseBoundaryOutput, /^CLUTCH RELEASE BOUNDARY VERIFY PASS$/m);
assert.match(releaseBoundaryOutput, /^unallowlisted_trial_rejection=PASS$/m);
assert.match(releaseBoundaryOutput, /^missing_file_rejection=PASS$/m);
const portabilityOutput = runNode(join(root, "scripts", "verify-portability.mjs"));
assert.match(portabilityOutput, /^PORTABILITY VERIFY PASS$/m);
assert.match(portabilityOutput, /^documented_harnesses=5$/m);
assert.match(portabilityOutput, /^lock_contention_rejection=PASS$/m);
assert.match(portabilityOutput, /^drift_rejection=PASS$/m);
assert.match(portabilityOutput, /^path_escape_rejection=PASS$/m);
const visualOutput = runNode(join(root, "visuals", "verify-manual-transmission.mjs"));
assert.match(visualOutput, /^TRANSMISSION VISUAL VERIFY PASS$/m);

assert.equal(packageMetadata.version, "0.4.0-rc.1");
assert.equal(packageMetadata.license, "Apache-2.0");
assert.equal(packageMetadata.scripts["verify:analysis"], "node evaluation/scripts/verify-analysis.mjs");
assert.equal(packageMetadata.scripts["verify:evaluation"], "node evaluation/scripts/verify-evaluation.mjs");
assert.equal(packageMetadata.scripts["verify:fuses"], "node clutch/scripts/verify-fuses.mjs");
assert.equal(packageMetadata.scripts["verify:live-telemetry-authorization"], "node evaluation/scripts/verify-live-telemetry-authorization.mjs");
assert.equal(packageMetadata.scripts["verify:stage0-acceptance"], "node evaluation/scripts/verify-stage0-acceptance.mjs");
assert.equal(packageMetadata.scripts["verify:stage0-preparation"], "node evaluation/scripts/verify-stage0-preparation.mjs");
assert.equal(packageMetadata.scripts["verify:study-proposal"], "node evaluation/scripts/verify-study-proposal.mjs");
assert.equal(packageMetadata.scripts["verify:release-boundary"], "node scripts/verify-release-boundary.mjs");
assert.equal(packageMetadata.scripts["verify:portability"], "node scripts/verify-portability.mjs");
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
const actualReleaseFiles = releasePaths.map(portablePath).sort();
assert.equal(firstPathSetProblem(actualReleaseFiles, releaseAllowlist.release_files), null, "Repository differs from the explicit release allowlist");
assert.equal(firstPathSetProblem([...releaseAllowlist.release_files, ".clutch-trial/private.txt"], releaseAllowlist.release_files), "UNALLOWLISTED_RELEASE_FILE:.clutch-trial/private.txt");
assert.equal(firstPathSetProblem(releaseAllowlist.release_files.filter((path) => path !== "README.md"), releaseAllowlist.release_files), "MISSING_RELEASE_FILE:README.md");
assert.deepEqual(releaseManifest.files, sortedReceipts(releaseAllowlist.release_files.map((path) => join(root, ...path.split("/")))), "Release manifest differs from allowlisted repository bytes");

const textPaths = releasePaths;
const formerSkillName = ["route", "approved", "model", "work"].join("-");
const privateEmail = ["jaketillerpcs", "gmail.com"].join("@");
const privateName = ["Jake", "Tiller"].join(" ");
for (const path of textPaths) {
  const source = readFileSync(path).toString("utf8");
  assert.ok(!portablePath(path).toLowerCase().includes(".clutch-trial"), `${portablePath(path)} is a local trial artifact`);
  assert.ok(!/\.(?:zip|7z|tar|tgz|gz)$/i.test(path), `${portablePath(path)} is an unreviewed archive`);
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
  "documented_harnesses=5",
  "installation_layouts=2",
  "manual_handoff=SUPPORTED",
  "portability_projection=PASS",
  "license=Apache-2.0",
  "privacy_scan=PASS",
  "release_allowlist_negative_cases=2/2",
  `conformance_cases=${conformanceSuite.cases.length}`,
  `primary_reference_parity=${conformanceSuite.cases.length}/${conformanceSuite.cases.length}`,
  "fuse_cases=48",
  "fuse_hostile_cases=29",
  "fuse_reference_parity=19/19",
  "fuse_example=DELIVERABLE_WITH_ONE_REPAIR",
  "evaluation_gate=PASS_PREPARE_ONLY",
  "live_telemetry_authorization=PASS_BOUNDED_PROBE_ONLY",
  "caller_supplied_binding_boundary=CONFIRMED_TRUSTED_HOST_REQUIRED",
  "claim_ceiling=LOCAL_SYNTHETIC_CONFORMANCE_INSTALL_PROJECTION_EVALUATION_STRUCTURE_AND_RELEASE_BYTE_IDENTITY_ONLY",
].join("\n") + "\n");
