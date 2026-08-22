#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const baseName = "manual-transmission-shop-diagnostics.png";
const engagedName = "manual-transmission-shop-engaged-source.png";
const svgName = "manual-transmission-human-loop.svg";
const legendName = "manual-transmission-legend.json";

export const diagramSpec = Object.freeze({
  schema_version: "manual-transmission-metaphor.v4",
  title: "Human-in-the-loop manual routing",
  core_meaning: "The advisor retains full context, a human approves one compact task card, and one lower-cost worker executes one bounded attempt.",
  canvas: { width: 2048, image_height: 918, legend_height: 248, total_height: 1166 },
  palette: {
    forest: "#16301F",
    green_panel: "#2C4A38",
    green_line: "#4A6B56",
    copper: "#A8794F",
    mineral: "#43525C",
    silver_white: "#FAFCF7",
    silver_dim: "#E8E4D8",
    screen: "#101715",
    active: "#68A77B",
  },
  images: {
    base: {
      file: baseName,
      sha256: "f08a2fce8bab1b257a5ad4b42da2b8ac2d4fd419848dc2cdc4fc29c8a74cf553",
      width: 1083,
      height: 1453,
    },
    engaged: {
      file: engagedName,
      sha256: "eb69e08756b713e57e5e687a8c12dead4d729cd8d1f0674321a87c8722ddb2d9",
      width: 1084,
      height: 1451,
    },
  },
  panels: [
    {
      id: "neutral",
      x: 0,
      width: 683,
      image: "base",
      label: "NEUTRAL",
      descriptor: "Full context held. No worker runs.",
      plain_english: "The advisor session retains the full history while the trusted host withholds worker assignment.",
      text: { x: 38, y: 62 },
    },
    {
      id: "approve_card",
      x: 683,
      width: 682,
      image: "base",
      label: "APPROVE CARD",
      descriptor: "Human scopes one compact task.",
      plain_english: "The human reviews and approves the exact bounded card. Approval permits one assignment, not unlimited reuse.",
      text: { x: 721, y: 62 },
    },
    {
      id: "engaged",
      x: 1365,
      width: 683,
      image: "base_plus_engagement",
      label: "ENGAGED",
      descriptor: "One card. One lower-cost attempt.",
      plain_english: "The trusted host sends the exact approved card to one qualified lower-cost worker for one bounded attempt.",
      text: { x: 1403, y: 62 },
    },
  ],
  engagement_overlay: {
    source: "engaged",
    target_panel: "engaged",
    explanation: "Only the lever, selector fork, and synchronizer engagement region comes from the edited source. Every frame otherwise reuses the same pinned base image.",
    feather: 3.5,
    ellipses: [
      { cx: 1718, cy: 310, rx: 112, ry: 154 },
      { cx: 1684, cy: 448, rx: 118, ry: 108 },
    ],
  },
  screen_states: {
    neutral: {
      label: "FULL CONTEXT",
      mode: "dense_history",
      meaning: "The long conversation remains with the advisor.",
    },
    approve_card: {
      label: "APPROVED CARD",
      mode: "compact_card",
      meaning: "One compact task card is visible for human approval.",
    },
    engaged: {
      label: "BOUNDED WORKER",
      mode: "single_attempt",
      meaning: "The worker receives the compact card, not the full conversation.",
    },
  },
  thesis: {
    kicker: "HUMAN IN THE LOOP",
    headline: "FULL HISTORY STAYS WITH THE ADVISOR. ONLY THE APPROVED TASK MOVES.",
    body: "That limits worker context and moves routine labor to a lower-cost model. Failed checks return to neutral; retries need new approval. Verification and human acceptance still follow.",
    caveat_label: "CALIBRATION",
    caveat: "Savings vary; short tasks may not offset routing overhead.",
    efficiency_mechanism: "The worker receives a compact approved card rather than the full conversation, reducing worker-context volume while routine execution moves to a lower-cost model.",
    neutral_definition: "No worker is engaged while scope, approval, or retry is unresolved.",
    retry_rule: "One card authorizes one attempt. A failed check returns to neutral and every retry requires a new card and human approval.",
    acceptance_rule: "Verification informs later human acceptance; successful worker execution does not accept itself.",
  },
  deterministic_reading: {
    forward: ["neutral", "approve_card", "engaged"],
    reverse_audit: ["engaged", "approve_card", "neutral"],
    authority_trace: ["advisor_context", "human_approval", "trusted_host", "bounded_worker"],
    retry_trace: ["failed_check", "neutral", "new_card", "new_human_approval"],
  },
  invariants: [
    "All three frames reuse the exact same pinned laptop-and-shop base image.",
    "Only the engaged frame overlays the shifter, selector fork, and synchronizer engagement region.",
    "Laptop screen states are deterministic SVG overlays; generated text is never trusted.",
    "Neutral means no worker is engaged.",
    "Human approval is mandatory before worker assignment, so the architecture is human-in-the-loop.",
    "One approved card authorizes one worker attempt.",
    "A retry requires a new card and new human approval.",
    "The worker receives the compact card, not the full conversation.",
    "Lower context volume and lower model price are distinct possible cost benefits.",
    "Verification and human acceptance occur after the depicted engagement state.",
    "Savings are workload-dependent and are not established by this visual.",
  ],
  claim_ceiling: "This is a control and cost-routing metaphor. It does not prove authenticated identity, secure isolation, correct model judgment, measured savings, or accepted output.",
});

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", "Expected a PNG image");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function validateSpec(spec) {
  assert.equal(spec.schema_version, "manual-transmission-metaphor.v4");
  assert.equal(spec.panels.length, 3, "Exactly three states are required");
  assert.deepEqual(spec.panels.map(({ id }) => id), ["neutral", "approve_card", "engaged"]);
  assert.deepEqual(spec.panels.map(({ label }) => label), ["NEUTRAL", "APPROVE CARD", "ENGAGED"]);
  assert.deepEqual(spec.panels.map(({ descriptor }) => descriptor), [
    "Full context held. No worker runs.",
    "Human scopes one compact task.",
    "One card. One lower-cost attempt.",
  ]);
  assert.equal(spec.panels[0].image, "base");
  assert.equal(spec.panels[1].image, "base");
  assert.equal(spec.panels[2].image, "base_plus_engagement");
  assert.equal(spec.panels.reduce((sum, panel) => sum + panel.width, 0), spec.canvas.width);
  assert.equal(spec.canvas.image_height + spec.canvas.legend_height, spec.canvas.total_height);

  const ids = new Set();
  for (const panel of spec.panels) {
    assert.ok(!ids.has(panel.id), `Duplicate panel ID: ${panel.id}`);
    ids.add(panel.id);
    assert.ok(panel.label && panel.descriptor && panel.plain_english, `${panel.id}: text is incomplete`);
    assert.ok(panel.text.x >= panel.x && panel.text.x <= panel.x + panel.width, `${panel.id}: label is outside its panel`);
    assert.ok(panel.text.y >= 0 && panel.text.y <= spec.canvas.image_height, `${panel.id}: label y is outside the image`);
    assert.ok(spec.screen_states[panel.id], `${panel.id}: screen state is required`);
  }

  assert.equal(spec.engagement_overlay.target_panel, "engaged");
  assert.equal(spec.engagement_overlay.ellipses.length, 2);
  for (const ellipse of spec.engagement_overlay.ellipses) {
    assert.ok(ellipse.cx - ellipse.rx >= 1365 && ellipse.cx + ellipse.rx <= 2048, "Engagement mask must stay in panel three");
    assert.ok(ellipse.cy - ellipse.ry >= 0 && ellipse.cy + ellipse.ry <= spec.canvas.image_height, "Engagement mask must stay in image bounds");
  }

  assert.deepEqual(spec.deterministic_reading.forward, ["neutral", "approve_card", "engaged"]);
  assert.ok(spec.thesis.kicker.includes("HUMAN IN THE LOOP"));
  assert.ok(spec.thesis.headline.includes("FULL HISTORY STAYS"));
  assert.ok(spec.thesis.headline.includes("ONLY THE APPROVED TASK MOVES"));
  assert.ok(spec.thesis.body.includes("lower-cost model"));
  assert.ok(spec.thesis.body.includes("retries need new approval"));
  assert.ok(spec.invariants.some((text) => text.includes("human-in-the-loop")), "Human-in-the-loop invariant is required");
  assert.ok(spec.invariants.some((text) => text.includes("distinct possible cost benefits")), "Cost mechanism separation is required");
  assert.ok(spec.invariants.some((text) => text.includes("not established by this visual")), "Savings caveat is required");
}

function validateImages(spec) {
  const receipts = {};
  for (const [id, image] of Object.entries(spec.images)) {
    const bytes = readFileSync(join(root, image.file));
    const dimensions = pngDimensions(bytes);
    const digest = sha256(bytes);
    assert.equal(digest, image.sha256, `${id}: image digest changed`);
    assert.deepEqual(dimensions, { width: image.width, height: image.height }, `${id}: image dimensions changed`);
    receipts[id] = { file: image.file, sha256: digest, ...dimensions, bytes: bytes.length };
  }
  return receipts;
}

function renderPanelImage(panel, spec) {
  const base = `<image href="${baseName}" x="${panel.x}" y="0" width="${panel.width}" height="${spec.canvas.image_height}" preserveAspectRatio="xMidYMid slice"/>`;
  if (panel.id !== spec.engagement_overlay.target_panel) return base;
  return `${base}\n    <image href="${engagedName}" x="${panel.x}" y="0" width="${panel.width}" height="${spec.canvas.image_height}" preserveAspectRatio="xMidYMid slice" mask="url(#engagement-only)"/>`;
}

function renderPanelLabel(panel) {
  return `<g id="state-${xml(panel.id)}" role="group" aria-label="${xml(`${panel.label}: ${panel.descriptor}`)}">
      <text class="state-label" x="${panel.text.x}" y="${panel.text.y}">${xml(panel.label)}</text>
      <text class="state-copy" x="${panel.text.x}" y="${panel.text.y + 29}">${xml(panel.descriptor)}</text>
    </g>`;
}

function renderDenseHistory(x, y, p) {
  const widths = [126, 112, 131, 104, 121, 116, 128];
  return widths.map((width, index) => `<rect x="${x + 8}" y="${y + 27 + index * 8}" width="${width}" height="3" rx="1.5" fill="${index === 0 ? p.copper : p.silver_dim}" opacity="${index === 0 ? ".86" : ".52"}"/>`).join("\n      ");
}

function renderCompactCard(x, y, p) {
  return `<rect x="${x + 32}" y="${y + 27}" width="86" height="50" rx="3" fill="${p.green_panel}" stroke="${p.copper}" stroke-width="1.4"/>
      <rect x="${x + 42}" y="${y + 37}" width="53" height="3" rx="1.5" fill="${p.silver_dim}" opacity=".82"/>
      <rect x="${x + 42}" y="${y + 46}" width="65" height="3" rx="1.5" fill="${p.silver_dim}" opacity=".58"/>
      <rect x="${x + 42}" y="${y + 55}" width="45" height="3" rx="1.5" fill="${p.silver_dim}" opacity=".58"/>
      <circle cx="${x + 104}" cy="${y + 66}" r="5.5" fill="${p.active}"/>
      <path d="M${x + 101} ${y + 66} l2 2 4 -5" fill="none" stroke="${p.silver_white}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function renderSingleAttempt(x, y, p) {
  return `<rect x="${x + 10}" y="${y + 30}" width="55" height="42" rx="3" fill="${p.green_panel}" stroke="${p.copper}" stroke-width="1.2"/>
      <rect x="${x + 18}" y="${y + 40}" width="36" height="3" rx="1.5" fill="${p.silver_dim}" opacity=".78"/>
      <rect x="${x + 18}" y="${y + 49}" width="29" height="3" rx="1.5" fill="${p.silver_dim}" opacity=".55"/>
      <rect x="${x + 80}" y="${y + 36}" width="52" height="5" rx="2.5" fill="${p.green_panel}"/>
      <rect x="${x + 80}" y="${y + 36}" width="38" height="5" rx="2.5" fill="${p.active}"/>
      <circle cx="${x + 86}" cy="${y + 56}" r="5" fill="${p.active}"/>
      <circle cx="${x + 104}" cy="${y + 56}" r="5" fill="${p.active}" opacity=".72"/>
      <circle cx="${x + 122}" cy="${y + 56}" r="5" fill="${p.active}" opacity=".44"/>`;
}

function renderScreenState(panel, spec) {
  const state = spec.screen_states[panel.id];
  const p = spec.palette;
  const x = panel.x + 7;
  const y = 307;
  let content;
  if (state.mode === "dense_history") content = renderDenseHistory(x, y, p);
  else if (state.mode === "compact_card") content = renderCompactCard(x, y, p);
  else if (state.mode === "single_attempt") content = renderSingleAttempt(x, y, p);
  else throw new Error(`Unknown screen mode: ${state.mode}`);

  return `<g id="screen-${xml(panel.id)}" role="group" aria-label="${xml(`${state.label}: ${state.meaning}`)}">
      <rect x="${x}" y="${y}" width="151" height="94" rx="3" fill="${p.screen}" stroke="${p.mineral}" stroke-width="1.2"/>
      <text class="screen-label" x="${x + 8}" y="${y + 16}">${xml(state.label)}</text>
      ${content}
    </g>`;
}

function renderSvg(spec) {
  const p = spec.palette;
  const engagementEllipses = spec.engagement_overlay.ellipses.map((ellipse) => `<ellipse cx="${ellipse.cx}" cy="${ellipse.cy}" rx="${ellipse.rx}" ry="${ellipse.ry}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.canvas.width}" height="${spec.canvas.total_height}" viewBox="0 0 ${spec.canvas.width} ${spec.canvas.total_height}" role="img" aria-labelledby="title description">
  <title id="title">Human-in-the-loop manual routing</title>
  <desc id="description">The same transmission shop progresses from neutral, to human approval of one compact task card, to one engaged lower-cost worker attempt. The laptop remains fixed while its screen compresses full context into one bounded card. Only the third transmission is mechanically engaged.</desc>
  <defs>
    <filter id="engagement-feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${spec.engagement_overlay.feather}"/></filter>
    <mask id="engagement-only" maskUnits="userSpaceOnUse" x="0" y="0" width="${spec.canvas.width}" height="${spec.canvas.image_height}">
      <rect x="0" y="0" width="${spec.canvas.width}" height="${spec.canvas.image_height}" fill="black"/>
      <g fill="white" filter="url(#engagement-feather)">${engagementEllipses}</g>
    </mask>
    <linearGradient id="label-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.forest}" stop-opacity=".72"/><stop offset="1" stop-color="${p.forest}" stop-opacity="0"/></linearGradient>
  </defs>
  <style>
    .state-label,.state-copy,.screen-label,.loop-title,.thesis-headline,.loop-copy,.fit-copy{font-family:Arial,Helvetica,sans-serif}
    .state-label{fill:${p.silver_white};font-size:23px;font-weight:600;letter-spacing:2.5px;paint-order:stroke;stroke:${p.forest};stroke-width:4px;stroke-linejoin:round}
    .state-copy{fill:${p.silver_dim};font-size:17px;font-weight:400;letter-spacing:.15px;paint-order:stroke;stroke:${p.forest};stroke-width:3px;stroke-linejoin:round}
    .screen-label{fill:${p.silver_white};font-size:9px;font-weight:600;letter-spacing:1.1px}
    .loop-title{fill:${p.copper};font-size:16px;font-weight:600;letter-spacing:2.2px}
    .thesis-headline{fill:${p.silver_white};font-size:27px;font-weight:600;letter-spacing:1.5px}
    .loop-copy{fill:${p.silver_dim};font-size:17px;font-weight:400}
    .fit-copy{fill:${p.silver_dim};font-size:14px;font-weight:400;letter-spacing:.2px}
  </style>
  <g id="shop-states">
    ${spec.panels.map((panel) => renderPanelImage(panel, spec)).join("\n    ")}
    ${spec.panels.map((panel) => renderScreenState(panel, spec)).join("\n    ")}
    ${spec.panels.map((panel) => `<rect x="${panel.x}" y="0" width="${panel.width}" height="145" fill="url(#label-shade)"/>`).join("\n    ")}
    <line x1="683" y1="0" x2="683" y2="${spec.canvas.image_height}" stroke="${p.silver_white}" stroke-width="2" opacity=".78"/>
    <line x1="1365" y1="0" x2="1365" y2="${spec.canvas.image_height}" stroke="${p.silver_white}" stroke-width="2" opacity=".78"/>
    ${spec.panels.map(renderPanelLabel).join("\n    ")}
  </g>
  <g id="thesis">
    <rect x="0" y="${spec.canvas.image_height}" width="${spec.canvas.width}" height="${spec.canvas.legend_height}" fill="${p.forest}"/>
    <line x1="0" y1="${spec.canvas.image_height}" x2="${spec.canvas.width}" y2="${spec.canvas.image_height}" stroke="${p.green_line}" stroke-width="2"/>
    <text class="loop-title" x="58" y="955">${xml(spec.thesis.kicker)}</text>
    <text class="thesis-headline" x="58" y="997">${xml(spec.thesis.headline)}</text>
    <text class="loop-copy" x="58" y="1045">${xml(spec.thesis.body)}</text>
    <text class="fit-copy" x="58" y="1127"><tspan fill="${p.copper}" font-weight="600" letter-spacing="1.5px">${xml(spec.thesis.caveat_label)}</tspan><tspan dx="16">${xml(spec.thesis.caveat)}</tspan></text>
  </g>
</svg>
`;
}

function legendDocument(spec, imageReceipts) {
  return {
    schema_version: spec.schema_version,
    title: spec.title,
    core_meaning: spec.core_meaning,
    states: spec.panels.map(({ id, label, descriptor, plain_english, image }) => ({
      id,
      label,
      descriptor,
      plain_english,
      image_rule: image,
      screen_state: spec.screen_states[id],
    })),
    image_receipts: imageReceipts,
    engagement_overlay: spec.engagement_overlay,
    thesis: spec.thesis,
    deterministic_reading: spec.deterministic_reading,
    invariants: spec.invariants,
    claim_ceiling: spec.claim_ceiling,
  };
}

function main() {
  validateSpec(diagramSpec);
  const imageReceipts = validateImages(diagramSpec);
  const svg = renderSvg(diagramSpec);
  const legend = `${JSON.stringify(legendDocument(diagramSpec, imageReceipts), null, 2)}\n`;
  const checkOnly = process.argv.includes("--check");

  if (checkOnly) {
    assert.equal(readFileSync(join(root, svgName), "utf8"), svg, "SVG differs from the Node specification");
    assert.equal(readFileSync(join(root, legendName), "utf8"), legend, "Legend differs from the Node specification");
  } else {
    writeFileSync(join(root, svgName), svg, "utf8");
    writeFileSync(join(root, legendName), legend, "utf8");
  }

  process.stdout.write([
    checkOnly ? "TRANSMISSION DIAGRAM CHECK PASS" : "TRANSMISSION DIAGRAM WRITE PASS",
    `states=${diagramSpec.panels.length}`,
    `state_order=${diagramSpec.deterministic_reading.forward.join("->")}`,
    `same_base_all_frames=${diagramSpec.panels.every(({ image }) => image.startsWith("base"))}`,
    `engagement_overlay_only_panel_three=${diagramSpec.panels.filter(({ image }) => image === "base_plus_engagement").length === 1}`,
    `screen_states=${Object.keys(diagramSpec.screen_states).length}`,
    `base_sha256=${imageReceipts.base.sha256}`,
    `engaged_sha256=${imageReceipts.engaged.sha256}`,
    "human_in_the_loop=true",
  ].join("\n") + "\n");
}

main();
