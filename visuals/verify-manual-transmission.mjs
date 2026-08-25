#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);

function read(name) {
  return readFileSync(join(root, name));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", "Expected a PNG image");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const legend = JSON.parse(read("manual-transmission-legend.json").toString("utf8"));
const svg = read("manual-transmission-human-loop.svg").toString("utf8");
const finalPng = read("manual-transmission-human-loop.png");
const readme = readFileSync(join(projectRoot, "README.md"), "utf8");
const architecture = readFileSync(join(projectRoot, "docs", "architecture.md"), "utf8");

assert.equal(legend.schema_version, "manual-transmission-metaphor.v4");
assert.equal(legend.states.length, 3);
assert.deepEqual(legend.states.map(({ id }) => id), ["neutral", "approve_card", "engaged"]);
assert.deepEqual(legend.states.map(({ label }) => label), ["NEUTRAL", "APPROVE CARD", "ENGAGED"]);
assert.deepEqual(legend.states.map(({ descriptor }) => descriptor), [
  "Full context held. No worker runs.",
  "Human scopes one compact task.",
  "One card. One lower-cost attempt.",
]);
assert.deepEqual(legend.states.map(({ image_rule }) => image_rule), ["base", "base", "base_plus_engagement"]);
assert.deepEqual(legend.states.map(({ screen_state }) => screen_state.label), ["FULL CONTEXT", "APPROVED CARD", "BOUNDED WORKER"]);
assert.deepEqual(legend.states.map(({ screen_state }) => screen_state.mode), ["dense_history", "compact_card", "single_attempt"]);
assert.deepEqual(legend.deterministic_reading.forward, ["neutral", "approve_card", "engaged"]);
assert.deepEqual(legend.deterministic_reading.reverse_audit, ["engaged", "approve_card", "neutral"]);
assert.deepEqual(legend.deterministic_reading.retry_trace, ["failed_check", "neutral", "new_card", "new_human_approval"]);

assert.equal(legend.thesis.kicker, "HUMAN IN THE LOOP");
assert.equal(legend.thesis.headline, "FULL HISTORY STAYS WITH THE ADVISOR. ONLY THE APPROVED TASK MOVES.");
assert.ok(legend.thesis.body.includes("lower-cost model"));
assert.ok(legend.thesis.body.includes("Failed checks return to neutral"));
assert.ok(legend.thesis.body.includes("Verification and human acceptance still follow"));
assert.ok(legend.thesis.caveat.includes("short tasks may not offset routing overhead"));
assert.ok(legend.thesis.retry_rule.includes("every retry requires a new card and human approval"));
assert.ok(legend.invariants.some((text) => text.includes("human-in-the-loop")));
assert.ok(legend.invariants.some((text) => text.includes("distinct possible cost benefits")));
assert.ok(legend.invariants.some((text) => text.includes("not established by this visual")));

assert.equal((svg.match(/manual-transmission-shop-diagnostics\.png/g) ?? []).length, 3);
assert.equal((svg.match(/manual-transmission-shop-engaged-source\.png/g) ?? []).length, 1);
assert.equal((svg.match(/mask="url\(#engagement-only\)"/g) ?? []).length, 1);
assert.equal((svg.match(/id="screen-(neutral|approve_card|engaged)"/g) ?? []).length, 3);
assert.equal((svg.match(/<polyline/g) ?? []).length, 0, "Leader polylines must be absent");
assert.ok(!svg.includes("anchor-dot"), "Anchor dots must be absent");
assert.ok(!svg.includes("class=\"leader\""), "Leader classes must be absent");

for (const text of [
  "NEUTRAL",
  "Full context held. No worker runs.",
  "APPROVE CARD",
  "Human scopes one compact task.",
  "ENGAGED",
  "One card. One lower-cost attempt.",
  "FULL CONTEXT",
  "APPROVED CARD",
  "BOUNDED WORKER",
  legend.thesis.kicker,
  legend.thesis.headline,
  legend.thesis.body,
  legend.thesis.caveat,
]) {
  assert.ok(svg.includes(text), `SVG is missing '${text}'`);
}

for (const stale of ["NEW ISSUE", "DIAGNOSTICS", "READY TO SHIP", "HUMAN ON THE LOOP"]) {
  assert.ok(!svg.includes(stale), `SVG retains stale text: ${stale}`);
  assert.ok(!architecture.includes(stale), `Architecture guide retains stale text: ${stale}`);
}

for (const receipt of Object.values(legend.image_receipts)) {
  const bytes = read(receipt.file);
  assert.equal(sha256(bytes), receipt.sha256, `${receipt.file}: digest mismatch`);
  assert.equal(bytes.length, receipt.bytes, `${receipt.file}: byte length mismatch`);
  assert.deepEqual(pngDimensions(bytes), { width: receipt.width, height: receipt.height }, `${receipt.file}: dimensions mismatch`);
}

assert.deepEqual(pngDimensions(finalPng), { width: 2048, height: 1166 });
assert.ok(architecture.includes("Every panel begins with the exact same pinned laptop-and-shop image."));
assert.ok(architecture.includes("Only panel three overlays the edited lever, selector fork, and synchronizer engagement region."));
assert.ok(architecture.includes("Lower context volume and lower model price are separate possible benefits."));
assert.ok(architecture.includes("NEUTRAL -> APPROVE CARD -> ENGAGED"));
assert.ok(architecture.includes("the architecture is human-in-the-loop"));
assert.ok(architecture.includes("The same phase never runs twice."));
assert.ok(readme.includes("guarantees no savings"));
assert.ok(readme.includes("PREPARE_ONLY"));

process.stdout.write([
  "TRANSMISSION VISUAL VERIFY PASS",
  "states=3",
  "state_order=neutral->approve_card->engaged",
  "same_base_all_frames=true",
  "engagement_overlay=panel_three_only",
  "screen_progression=full_context->approved_card->bounded_worker",
  "leader_lines=0",
  "human_in_the_loop=true",
  "token_efficiency_copy=PASS",
  "claim_calibration=PASS",
  `final_png_sha256=${sha256(finalPng)}`,
  "final_png_dimensions=2048x1166",
  "documentation_consistency=PASS",
  `claim_ceiling=${legend.claim_ceiling}`,
].join("\n") + "\n");
