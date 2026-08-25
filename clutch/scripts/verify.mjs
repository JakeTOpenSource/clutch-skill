#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson, reduceInput } from "./card-gate.mjs";
import { projectInput } from "./release-reference.mjs";
import { validateSkill } from "./validate-skill.mjs";

const FIXTURE_SHA256 = "6ee353a338e49f74d4cbedde2774d185efa9c26156e969de9a1c1e721caf018b";

function firstError(report) {
  return report.validation.errors.length === 0 ? null : report.validation.errors[0].code;
}

function firstSummary(report) {
  return report.card_summaries.length === 0 ? null : report.card_summaries[0];
}

function firstReferenceCard(report) {
  return report.cards.length === 0 ? null : report.cards[0];
}

function contentBearingStrings(card) {
  const fields = [
    "objective", "claim_ceiling", "facts", "advisor_findings", "constraints",
    "unknowns", "allowed_actions", "forbidden_actions", "required_outputs",
    "acceptance_checks", "stop_conditions",
  ];
  const values = [];
  for (const field of fields) {
    const value = card?.[field];
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) values.push(...value.filter((entry) => typeof entry === "string"));
  }
  for (const source of card?.source_refs ?? []) {
    for (const field of ["locator", "digest", "access"]) {
      if (typeof source?.[field] === "string") values.push(source[field]);
    }
  }
  return [...new Set(values.filter((value) => value.length > 0 && value !== "UNKNOWN"))];
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function assertSafeTemporaryRoot(path) {
  const relation = relative(resolve(tmpdir()), resolve(path));
  assert.ok(relation !== "" && relation !== ".." && !relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(relation), "Refusing unsafe temporary cleanup");
}

function runCli(script, input, expectedExit) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "approved-routing-"));
  const inputPath = join(temporaryRoot, "input.json");
  try {
    writeFileSync(inputPath, `${canonicalJson(input)}\n`, "utf8");
    const processResult = spawnSync(process.execPath, [script, "--input", inputPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(processResult.status, expectedExit, `${basename(script)} CLI exit code`);
    assert.equal(processResult.stderr, "", `${basename(script)} CLI wrote to stderr`);
    assert.ok(processResult.stdout.endsWith("\n"), `${basename(script)} CLI output lacks final newline`);
    assert.ok(!processResult.stdout.includes(temporaryRoot), `${basename(script)} leaked a temporary path`);
    return JSON.parse(processResult.stdout);
  } finally {
    const resolvedTemporaryRoot = resolve(temporaryRoot);
    assertSafeTemporaryRoot(resolvedTemporaryRoot);
    rmSync(resolvedTemporaryRoot, { force: true, recursive: true });
  }
}

function skillFixture(base, index, options = {}) {
  const directoryName = `validator-case-${index}`;
  const skillName = options.skillName ?? directoryName;
  const root = join(base, directoryName);
  mkdirSync(join(root, "agents"), { recursive: true });
  const extraFrontmatter = options.extraFrontmatter ? `\n${options.extraFrontmatter}` : "";
  const body = options.body ?? "# Test Skill\n\nApply one bounded test.";
  const skill = `---\nname: ${skillName}\ndescription: Dependency-free structural validator fixture.${extraFrontmatter}\n---\n\n${body}\n`;
  writeFileSync(join(root, "SKILL.md"), skill, "utf8");
  if (!options.omitOpenAiYaml) {
    const displayName = options.unquotedDisplayName ? "Validator Test" : '"Validator Test"';
    const shortDescription = options.shortDescription ?? '"Validate a bounded skill fixture"';
    const promptSkill = options.promptSkill ?? skillName;
    const yaml = `interface:\n  display_name: ${displayName}\n  short_description: ${shortDescription}\n  default_prompt: "Use $${promptSkill} to validate one bounded fixture."\npolicy:\n  allow_implicit_invocation: true\n`;
    writeFileSync(join(root, "agents", "openai.yaml"), yaml, "utf8");
  }
  if (options.referenceFile) {
    mkdirSync(join(root, "references"), { recursive: true });
    writeFileSync(join(root, "references", options.referenceFile), "fixture\n", "utf8");
  }
  return root;
}

function verifySkillValidator() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "skill-validator-"));
  try {
    const cases = [
      { expected: true, root: skillFixture(temporaryRoot, 1), fragment: "SKILL VALID" },
      { expected: false, root: skillFixture(temporaryRoot, 2, { extraFrontmatter: "unexpected: value" }), fragment: "Unexpected" },
      { expected: false, root: skillFixture(temporaryRoot, 3, { body: "# Test\n\n[TODO: finish this]" }), fragment: "TODO" },
      { expected: false, root: skillFixture(temporaryRoot, 4, { body: "# Test\n\nRead [missing](references/missing.md)." }), fragment: "not found" },
      { expected: false, root: skillFixture(temporaryRoot, 5, { promptSkill: "different-skill" }), fragment: "default_prompt" },
      { expected: false, root: skillFixture(temporaryRoot, 6, { shortDescription: '"Too short"' }), fragment: "25 to 64" },
      { expected: false, root: skillFixture(temporaryRoot, 7, { unquotedDisplayName: true }), fragment: "display_name" },
      { expected: false, root: skillFixture(temporaryRoot, 8, { skillName: "different-skill" }), fragment: "must match" },
      { expected: true, root: skillFixture(temporaryRoot, 9, { omitOpenAiYaml: true }), fragment: "SKILL VALID" },
      { expected: true, root: skillFixture(temporaryRoot, 10, { extraFrontmatter: "compatibility: Any Agent Skills-compatible host." }), fragment: "SKILL VALID" },
      { expected: false, root: skillFixture(temporaryRoot, 11, { extraFrontmatter: `compatibility: ${"x".repeat(501)}` }), fragment: "500" },
    ];
    for (const testCase of cases) {
      const validation = validateSkill(testCase.root);
      assert.equal(validation.valid, testCase.expected, `${basename(testCase.root)}: unexpected validator decision`);
      assert.ok(validation.message.includes(testCase.fragment), `${basename(testCase.root)}: unexpected validator message '${validation.message}'`);
    }
    return cases.length;
  } finally {
    assertSafeTemporaryRoot(temporaryRoot);
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function verify() {
  const scriptRoot = dirname(fileURLToPath(import.meta.url));
  const skillRoot = dirname(scriptRoot);
  const fixturePath = join(scriptRoot, "fixtures", "conformance-cases.json");
  const fixtureBytes = readFileSync(fixturePath);
  const fixtureDigest = createHash("sha256").update(fixtureBytes).digest("hex");
  assert.equal(fixtureDigest, FIXTURE_SHA256, "Fixture digest changed; review cases before updating the pinned digest");

  const skillValidation = validateSkill(skillRoot);
  assert.equal(skillValidation.valid, true, skillValidation.message);
  const skillValidatorCases = verifySkillValidator();

  const forbiddenRuntimeFiles = walkFiles(skillRoot).filter((path) => {
    const lower = path.toLowerCase();
    return lower.endsWith(".py") || lower.endsWith(".pyc") || lower.includes("__pycache__");
  });
  assert.deepEqual(forbiddenRuntimeFiles, [], "Non-Node runtime artifacts are not permitted in this package");

  const suite = JSON.parse(fixtureBytes.toString("utf8"));
  assert.equal(suite.schema_version, "routing-conformance-suite.v1");
  assert.ok(Array.isArray(suite.cases) && suite.cases.length > 0, "No conformance cases found");

  let validCases = 0;
  let invalidCases = 0;
  let parityCases = 0;
  let releasedPositiveCases = 0;
  let primaryContentLeaks = 0;
  let referenceContentLeaks = 0;

  for (const testCase of suite.cases) {
    const expected = testCase.expected;
    const [primary, exitCode] = reduceInput(testCase.input);
    const reference = projectInput(testCase.input);
    const summary = firstSummary(primary);
    const referenceCard = firstReferenceCard(reference);

    assert.equal(exitCode, expected.exit_code, `${testCase.case_id}: primary exit code`);
    assert.equal(primary.validation.status, expected.validation, `${testCase.case_id}: primary validation`);
    assert.equal(firstError(primary), expected.error_code, `${testCase.case_id}: primary first error`);
    assert.equal(primary.stream.activated, expected.activated, `${testCase.case_id}: primary activation`);
    assert.equal(primary.released_cards.length, expected.released_count, `${testCase.case_id}: primary released count`);
    assert.equal(summary?.state ?? null, expected.state, `${testCase.case_id}: primary state`);
    assert.equal(summary?.release_status ?? null, expected.release_status, `${testCase.case_id}: primary release status`);

    assert.equal(reference.validation, expected.validation, `${testCase.case_id}: reference validation`);
    assert.equal(reference.error_code, expected.error_code, `${testCase.case_id}: reference first error`);
    assert.equal(reference.activated, expected.activated, `${testCase.case_id}: reference activation`);
    assert.equal(reference.released_card_ids.length, expected.released_count, `${testCase.case_id}: reference released count`);
    assert.equal(referenceCard?.state ?? null, expected.state, `${testCase.case_id}: reference state`);
    assert.equal(referenceCard?.release_status ?? null, expected.release_status, `${testCase.case_id}: reference release status`);

    assert.equal(reference.validation, primary.validation.status, `${testCase.case_id}: projection validation parity`);
    assert.equal(reference.error_code, firstError(primary), `${testCase.case_id}: projection error parity`);
    assert.equal(reference.activated, primary.stream.activated, `${testCase.case_id}: projection activation parity`);
    assert.equal(reference.released_card_ids.length, primary.released_cards.length, `${testCase.case_id}: projection release parity`);
    assert.equal(referenceCard?.state ?? null, summary?.state ?? null, `${testCase.case_id}: projection state parity`);
    assert.equal(referenceCard?.release_status ?? null, summary?.release_status ?? null, `${testCase.case_id}: projection status parity`);
    parityCases += 1;

    if (expected.validation === "VALID") validCases += 1;
    else invalidCases += 1;
    if (expected.released_count > 0) {
      releasedPositiveCases += 1;
      for (const released of primary.released_cards) {
        assert.deepEqual(Object.keys(released).sort(), ["card_hash", "card_id", "worker_profile"], `${testCase.case_id}: release output must remain metadata-only`);
      }
    }
    const rendered = canonicalJson(primary);
    for (const card of testCase.input.cards ?? []) {
      for (const sensitiveValue of contentBearingStrings(card)) {
        if (rendered.includes(sensitiveValue)) primaryContentLeaks += 1;
      }
    }
    const renderedReference = canonicalJson(reference);
    for (const card of testCase.input.cards ?? []) {
      for (const sensitiveValue of contentBearingStrings(card)) {
        if (renderedReference.includes(sensitiveValue)) referenceContentLeaks += 1;
      }
    }
  }

  const validPhaseCase = suite.cases.find((entry) => entry.case_id === "active-approved-released");
  assert.ok(validPhaseCase, "Required phase-contract case missing");
  const phaseContractMutations = [
    ["empty-phase-id", (input) => { input.cards[0].routing.phase_id = ""; }, "INVALID_MODEL_PHASE_ID"],
    ["unknown-from-profile", (input) => { input.cards[0].routing.from_profile = "ghost"; }, "UNKNOWN_FROM_MODEL_PROFILE"],
    ["inverted-transition", (input) => { input.cards[0].routing.transition = "UPGRADE"; }, "MODEL_TRANSITION_RANK_MISMATCH"],
    ["bad-state-binding", (input) => { input.cards[0].routing.state_in_binding = "ANY_STATE"; }, "INVALID_STATE_BINDING"],
    ["duplicate-capability-rank", (input) => { input.policy.profile_ranks.worker_rank_2 = 1; }, "INVALID_PROFILE_RANKS"],
    ["legacy-fallback-field", (input) => { input.cards[0].routing.fallback_profile = "worker_rank_2"; }, "INVALID_ROUTING_FIELDS"],
  ];
  for (const [caseId, mutate, expectedError] of phaseContractMutations) {
    const input = structuredClone(validPhaseCase.input);
    mutate(input);
    const [primary, exitCode] = reduceInput(input);
    const reference = projectInput(input);
    assert.equal(exitCode, 2, `${caseId}: primary exit code`);
    assert.equal(firstError(primary), expectedError, `${caseId}: primary error`);
    assert.equal(reference.error_code, expectedError, `${caseId}: reference error`);
    assert.equal(reference.validation, primary.validation.status, `${caseId}: projection validation parity`);
  }

  assert.equal(primaryContentLeaks, 0, "Card content appeared in metadata-only primary output");
  assert.equal(referenceContentLeaks, 0, "Card content appeared in metadata-only reference output");

  const smokeCases = [
    suite.cases.find((entry) => entry.case_id === "active-approved-released"),
    suite.cases.find((entry) => entry.case_id === "wrong-card-hash"),
  ];
  for (const testCase of smokeCases) {
    assert.ok(testCase, "Required CLI smoke case missing");
    const [directPrimary] = reduceInput(testCase.input);
    const directReference = projectInput(testCase.input);
    const cliPrimary = runCli(join(scriptRoot, "card-gate.mjs"), testCase.input, testCase.expected.exit_code);
    const cliReference = runCli(join(scriptRoot, "release-reference.mjs"), testCase.input, testCase.expected.exit_code);
    assert.equal(canonicalJson(cliPrimary), canonicalJson(directPrimary), `${testCase.case_id}: primary CLI mismatch`);
    assert.equal(canonicalJson(cliReference), canonicalJson(directReference), `${testCase.case_id}: reference CLI mismatch`);
  }

  process.stdout.write([
    "VERIFY PASS",
    "runtime=node-only",
    `fixture_sha256=${fixtureDigest}`,
    `cases=${suite.cases.length}`,
    `valid_cases=${validCases}`,
    `invalid_cases=${invalidCases}`,
    `primary_reference_projection_parity=${parityCases}/${suite.cases.length}`,
    `phase_contract_adversarial_cases=${phaseContractMutations.length}`,
    `skill_validator_cases=${skillValidatorCases}`,
    `released_positive_cases=${releasedPositiveCases}`,
    `primary_content_leaks=${primaryContentLeaks}`,
    `reference_content_leaks=${referenceContentLeaks}`,
    "claim_ceiling=LOCAL_SYNTHETIC_ROUTING_CONFORMANCE_ONLY",
  ].join("\n") + "\n");
}

try {
  verify();
} catch (error) {
  process.stderr.write(`VERIFY FAIL: ${error.message}\n`);
  process.exitCode = 1;
}
