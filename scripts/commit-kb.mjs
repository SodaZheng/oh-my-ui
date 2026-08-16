#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  INTERNAL_DIR,
  VISIBLE_DIR,
  jsonText,
  readJson,
  readJsonl,
  renderKnowledge,
  validateKnowledgeData
} from "./kb-lib.mjs";

const [targetArg, candidateArg, recordArg] = process.argv.slice(2);
if (!targetArg || !candidateArg || !recordArg) {
  console.error("用法：commit-kb.mjs <项目根目录> <候选 knowledge.json> <变更记录.json>");
  process.exit(2);
}

const target = path.resolve(targetArg);
const candidatePath = path.resolve(candidateArg);
const recordPath = path.resolve(recordArg);
const internalRoot = path.join(target, INTERNAL_DIR);
const knowledgePath = path.join(internalRoot, "knowledge.json");
const evidencePath = path.join(internalRoot, "evidence.jsonl");
const changesPath = path.join(internalRoot, "changes.jsonl");
const visiblePath = path.join(target, VISIBLE_DIR);

let current;
let candidate;
let record;
let evidence;
try {
  current = readJson(knowledgePath);
  candidate = readJson(candidatePath);
  record = readJson(recordPath);
  evidence = readJsonl(evidencePath);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const evidenceIds = new Set(evidence.map((item) => item.id));
const validation = validateKnowledgeData(candidate, evidenceIds);
const commitErrors = [...validation.errors];
if (record.baseRevision !== current.revision) commitErrors.push("变更记录的 baseRevision 与当前版本不一致");
if (candidate.revision !== current.revision + 1) commitErrors.push("候选 revision 必须等于当前版本加一");
if (record.decision !== "confirmed") commitErrors.push("变更记录尚未确认");
if (!record.id || !record.type || !record.summary || !Array.isArray(record.targets)) commitErrors.push("变更记录缺少必要字段");
if (commitErrors.length) {
  for (const error of commitErrors) console.error(`错误：${error}`);
  process.exit(1);
}

candidate.project = candidate.project || {};
candidate.project.updatedAt = new Date().toISOString();
record.committedRevision = candidate.revision;
record.committedAt = new Date().toISOString();

const transactionRoot = fs.mkdtempSync(path.join(internalRoot, ".commit-"));
const nextVisible = path.join(transactionRoot, "visible-next");
const nextKnowledge = path.join(transactionRoot, "knowledge-next.json");
const nextChanges = path.join(transactionRoot, "changes-next.jsonl");
const backupVisible = path.join(transactionRoot, "visible-backup");
const backupKnowledge = path.join(transactionRoot, "knowledge-backup.json");
const backupChanges = path.join(transactionRoot, "changes-backup.jsonl");

fs.mkdirSync(nextVisible, { recursive: true });
for (const [relativePath, content] of renderKnowledge(candidate)) {
  const outputPath = path.join(nextVisible, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
}
fs.writeFileSync(nextKnowledge, jsonText(candidate), "utf8");
const existingChanges = fs.existsSync(changesPath) ? fs.readFileSync(changesPath, "utf8") : "";
fs.writeFileSync(nextChanges, `${existingChanges}${JSON.stringify(record)}\n`, "utf8");

const state = { visible: false, knowledge: false, changes: false };
try {
  if (fs.existsSync(visiblePath)) fs.renameSync(visiblePath, backupVisible);
  fs.renameSync(nextVisible, visiblePath);
  state.visible = true;

  fs.renameSync(knowledgePath, backupKnowledge);
  fs.renameSync(nextKnowledge, knowledgePath);
  state.knowledge = true;

  if (fs.existsSync(changesPath)) fs.renameSync(changesPath, backupChanges);
  fs.renameSync(nextChanges, changesPath);
  state.changes = true;
} catch (error) {
  try {
    if (state.changes && fs.existsSync(changesPath)) fs.renameSync(changesPath, nextChanges);
    if (fs.existsSync(backupChanges)) fs.renameSync(backupChanges, changesPath);
    if (state.knowledge && fs.existsSync(knowledgePath)) fs.renameSync(knowledgePath, nextKnowledge);
    if (fs.existsSync(backupKnowledge)) fs.renameSync(backupKnowledge, knowledgePath);
    if (state.visible && fs.existsSync(visiblePath)) fs.renameSync(visiblePath, nextVisible);
    if (fs.existsSync(backupVisible)) fs.renameSync(backupVisible, visiblePath);
  } catch (rollbackError) {
    console.error(`回滚失败：${rollbackError.message}`);
  }
  console.error(`提交失败：${error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(transactionRoot, { recursive: true, force: true });
}

if (!process.exitCode) {
  for (const warning of validation.warnings) console.warn(`警告：${warning}`);
  console.log(`已提交 ${record.id}：revision ${candidate.revision}`);
}
