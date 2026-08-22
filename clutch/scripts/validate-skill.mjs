#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_FRONTMATTER = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  return { message, valid: false };
}

function parseFlatFrontmatter(source) {
  const result = {};
  for (const rawLine of source.split(/\r?\n/)) {
    if (rawLine.trim() === "" || rawLine.trimStart().startsWith("#")) continue;
    const match = rawLine.match(/^([A-Za-z0-9-]+):(?:\s*)(.*)$/);
    if (!match) throw new Error(`Unsupported frontmatter line: ${rawLine}`);
    const [, key, rawValue] = match;
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate frontmatter key: ${key}`);
    if (rawValue === "") throw new Error(`Nested frontmatter is unsupported for key: ${key}`);
    if (rawValue.startsWith('"')) {
      result[key] = JSON.parse(rawValue);
    } else if (rawValue.startsWith("'")) {
      if (!rawValue.endsWith("'")) throw new Error(`Unclosed quoted value for key: ${key}`);
      result[key] = rawValue.slice(1, -1).replace(/''/g, "'");
    } else {
      result[key] = rawValue;
    }
  }
  return result;
}

function unfinishedTodoOutsideFences(body) {
  let fenceCharacter = null;
  let fenceWidth = 0;
  for (const line of body.split(/\r?\n/)) {
    const fence = line.match(/^[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/);
    if (fence) {
      const marker = fence[1];
      if (fenceCharacter === null) {
        fenceCharacter = marker[0];
        fenceWidth = marker.length;
      } else if (marker[0] === fenceCharacter && marker.length >= fenceWidth && fence[2].trim() === "") {
        fenceCharacter = null;
        fenceWidth = 0;
      }
      continue;
    }
    if (fenceCharacter === null && /^[ ]{0,3}\[TODO:[^\n]*\][ \t]*$/.test(line)) return true;
  }
  return false;
}

function validateLocalLinks(skillRoot, markdown) {
  const links = markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of links) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const withoutAnchor = target.split("#", 1)[0];
    if (isAbsolute(withoutAnchor)) return `Local documentation link must be relative: ${target}`;
    const resolved = resolve(skillRoot, withoutAnchor);
    const relation = relative(resolve(skillRoot), resolved);
    if (relation === ".." || relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(relation)) {
      return `Local documentation link escapes the skill directory: ${target}`;
    }
    if (!existsSync(resolved)) return `Linked skill resource not found: ${target}`;
  }
  return null;
}

function yamlQuotedValue(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^  ${escaped}:\\s*("(?:[^"\\\\]|\\\\.)*")\\s*$`, "m"));
  return match ? JSON.parse(match[1]) : null;
}

function validateOpenAiYaml(skillRoot, skillName) {
  const path = join(skillRoot, "agents", "openai.yaml");
  if (!existsSync(path)) return fail("agents/openai.yaml not found");
  const source = readFileSync(path, "utf8");
  if (source.includes("\t")) return fail("agents/openai.yaml must use spaces, not tabs");

  const topLevel = [...source.matchAll(/^([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]);
  const allowedTopLevel = new Set(["interface", "dependencies", "policy"]);
  if (topLevel.some((key) => !allowedTopLevel.has(key))) return fail("agents/openai.yaml has an unsupported top-level key");
  if (!topLevel.includes("interface") || !topLevel.includes("policy")) return fail("agents/openai.yaml requires interface and policy mappings");

  const displayName = yamlQuotedValue(source, "display_name");
  const shortDescription = yamlQuotedValue(source, "short_description");
  const defaultPrompt = yamlQuotedValue(source, "default_prompt");
  if (!displayName) return fail("agents/openai.yaml requires a quoted interface.display_name");
  if (!shortDescription || shortDescription.length < 25 || shortDescription.length > 64) {
    return fail("interface.short_description must be a quoted string of 25 to 64 characters");
  }
  if (!defaultPrompt || !defaultPrompt.includes(`$${skillName}`)) {
    return fail(`interface.default_prompt must explicitly mention $${skillName}`);
  }
  if (!/^  allow_implicit_invocation:\s*(true|false)\s*$/m.test(source)) {
    return fail("policy.allow_implicit_invocation must be true or false");
  }

  for (const line of source.split(/\r?\n/)) {
    const scalar = line.match(/^\s+[A-Za-z0-9_-]+:\s*(.+?)\s*$/);
    if (!scalar) continue;
    const value = scalar[1];
    if (!["true", "false"].includes(value) && !value.startsWith('"')) {
      return fail(`String values in agents/openai.yaml must be double-quoted: ${line.trim()}`);
    }
  }
  return { message: "agents/openai.yaml is valid", valid: true };
}

export function validateSkill(skillRoot) {
  const root = resolve(skillRoot);
  const skillPath = join(root, "SKILL.md");
  if (!existsSync(skillPath) || !statSync(skillPath).isFile()) return fail("SKILL.md not found");
  const content = readFileSync(skillPath, "utf8");
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatterMatch) return fail("Invalid or missing YAML frontmatter");

  let frontmatter;
  try {
    frontmatter = parseFlatFrontmatter(frontmatterMatch[1]);
  } catch (error) {
    return fail(`Invalid YAML frontmatter: ${error.message}`);
  }
  const unexpected = Object.keys(frontmatter).filter((key) => !ALLOWED_FRONTMATTER.has(key));
  if (unexpected.length > 0) return fail(`Unexpected SKILL.md frontmatter key(s): ${unexpected.sort().join(", ")}`);
  if (!Object.hasOwn(frontmatter, "name")) return fail("Missing 'name' in frontmatter");
  if (!Object.hasOwn(frontmatter, "description")) return fail("Missing 'description' in frontmatter");

  const name = String(frontmatter.name).trim();
  const description = String(frontmatter.description).trim();
  if (!NAME_PATTERN.test(name)) return fail(`Skill name '${name}' must use lowercase hyphen-case`);
  if (name.length > 64) return fail("Skill name exceeds 64 characters");
  if (basename(root) !== name) return fail(`Skill directory '${basename(root)}' must match frontmatter name '${name}'`);
  if (!description) return fail("Skill description must not be empty");
  if (description.length > 1024) return fail("Skill description exceeds 1024 characters");
  if (description.includes("<") || description.includes(">")) return fail("Skill description cannot contain angle brackets");
  if (description.startsWith("[TODO:")) return fail("Skill description contains an unfinished TODO placeholder");

  const body = content.slice(frontmatterMatch[0].length);
  if (unfinishedTodoOutsideFences(body)) return fail("Skill instructions contain an unfinished TODO placeholder");
  const linkProblem = validateLocalLinks(root, content);
  if (linkProblem) return fail(linkProblem);

  const openAiResult = validateOpenAiYaml(root, name);
  if (!openAiResult.valid) return openAiResult;
  return { message: "SKILL VALID: dependency-free structural checks passed", valid: true };
}

function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const defaultRoot = dirname(dirname(scriptPath));
  const root = process.argv[2] ? resolve(process.argv[2]) : defaultRoot;
  const outcome = validateSkill(root);
  process.stdout.write(`${outcome.message}\n`);
  process.exitCode = outcome.valid ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
