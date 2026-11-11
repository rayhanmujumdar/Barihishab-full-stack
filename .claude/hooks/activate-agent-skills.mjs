#!/usr/bin/env node
// UserPromptSubmit hook: tells Claude which project skills in .agents/skills
// match the prompt, so they get loaded before any work starts.
// Trigger rules live in skill-triggers.json next to this file.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const hookDir = dirname(fileURLToPath(import.meta.url));
const projectDir = process.env.CLAUDE_PROJECT_DIR || join(hookDir, "..", "..");
const skillsDir = join(projectDir, ".agents", "skills");

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
const prompt = String(input.prompt ?? "");
// Slash commands already pick their own skill.
if (!prompt.trim() || prompt.trim().startsWith("/")) process.exit(0);
if (!existsSync(skillsDir)) process.exit(0);

let triggers = {};
try {
  triggers = JSON.parse(readFileSync(join(hookDir, "skill-triggers.json"), "utf8"));
} catch {
  // No rules file: fall back to name matching only.
}

const skills = readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => !d.name.startsWith(".") && existsSync(join(skillsDir, d.name, "SKILL.md")))
  .map((d) => d.name);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matched = skills.filter((name) => {
  const byName = new RegExp(`\\b${escape(name)}\\b`, "i").test(prompt);
  const rule = triggers[name];
  let byRule = false;
  if (typeof rule === "string") {
    try {
      byRule = new RegExp(rule, "i").test(prompt);
    } catch {
      // Ignore an invalid regex rather than breaking every prompt.
    }
  }
  return byName || byRule;
});

if (matched.length === 0) process.exit(0);

const context = [
  "PROJECT SKILLS (.agents/skills) matched this prompt:",
  ...matched.map((n) => `- ${n}`),
  "Before doing the work, invoke each matched skill that is actually relevant with the Skill tool (one call per skill) and follow its instructions. Skip any match that is clearly a false positive for this request.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
  }),
);
