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
  validateEvidenceData,
  validateKnowledgeData
} from "./kb-lib.mjs";

const [targetArg, candidateArg, recordArg, evidenceArg] = process.argv.slice(2);
if (!targetArg || !candidateArg || !recordArg) {
  console.error("用法：commit-kb.mjs <知识库根目录> <候选 knowledge.json> <变更记录.json> [候选 evidence.jsonl]");
  process.exit(2);
}

const target = path.resolve(targetArg);
const candidatePath = path.resolve(candidateArg);
const recordPath = path.resolve(recordArg);
const candidateEvidencePath = evidenceArg ? path.resolve(evidenceArg) : null;
const internalRoot = path.join(target, INTERNAL_DIR);
const knowledgePath = path.join(internalRoot, "knowledge.json");
const evidencePath = path.join(internalRoot, "evidence.jsonl");
const changesPath = path.join(internalRoot, "changes.jsonl");
const visiblePath = path.join(target, VISIBLE_DIR);

let current;
let candidate;
let record;
let currentEvidence;
let candidateEvidence;
try {
  current = readJson(knowledgePath);
  candidate = readJson(candidatePath);
  record = readJson(recordPath);
  currentEvidence = readJsonl(evidencePath);
  candidateEvidence = candidateEvidencePath ? readJsonl(candidateEvidencePath) : currentEvidence;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const validation = validateKnowledgeData(candidate, candidateEvidence);
const evidenceValidation = validateEvidenceData(candidate, candidateEvidence);
const commitErrors = [...validation.errors, ...evidenceValidation.errors];
if (record.baseRevision !== current.revision) commitErrors.push("变更记录的 baseRevision 与当前版本不一致");
if (candidate.revision !== current.revision + 1) commitErrors.push("候选 revision 必须等于当前版本加一");
if (record.decision !== "confirmed") commitErrors.push("变更记录尚未确认");
if (!record.id || !record.type || !record.summary || !Array.isArray(record.targets)) commitErrors.push("变更记录缺少必要字段");
if (record.allowRemovals !== undefined && !Array.isArray(record.allowRemovals)) commitErrors.push("allowRemovals 必须为数组");

function objectMap(data) {
  const objects = [
    ...(data.sourceProjects || []), ...(data.categories || []), ...(data.generalRules || []),
    ...(data.components || []), ...(data.scenarios || []), ...(data.pageInstances || []), ...(data.pending || []),
    ...(data.scenarios || []).flatMap((scenario) => scenario.variants || [])
  ];
  return new Map(objects.filter((item) => item.id).map((item) => [item.id, item]));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

const currentObjects = objectMap(current);
const candidateObjects = objectMap(candidate);
const currentEvidenceById = new Map(currentEvidence.map((item) => [item.id, item]));
const candidateEvidenceById = new Map(candidateEvidence.map((item) => [item.id, item]));
const allowedRemovals = new Set(Array.isArray(record.allowRemovals) ? record.allowRemovals : []);
for (const id of currentObjects.keys()) {
  if (!candidateObjects.has(id) && !allowedRemovals.has(id)) commitErrors.push(`候选版本删除了既有对象 ${id}；如确需删除，必须在预览后列入 allowRemovals`);
}
for (const id of currentEvidenceById.keys()) {
  if (!candidateEvidenceById.has(id) && !allowedRemovals.has(id)) commitErrors.push(`候选版本删除了既有证据 ${id}；如确需删除，必须在预览后列入 allowRemovals`);
}
for (const id of allowedRemovals) {
  if (!record.targets.includes(id)) commitErrors.push(`allowRemovals 中的 ${id} 没有列入变更目标`);
}

if (record.type === "source-scan") {
  const scope = new Set(Array.isArray(record.sourceProjectIds) ? record.sourceProjectIds : []);
  if (scope.size === 0) commitErrors.push("source-scan 变更记录必须声明 sourceProjectIds");
  const candidateProjectIds = new Set((candidate.sourceProjects || []).map((item) => item.id));
  for (const id of scope) if (!candidateProjectIds.has(id)) commitErrors.push(`source-scan 作用域引用了不存在的来源项目 ${id}`);
  for (const project of current.sourceProjects || []) {
    if (!scope.has(project.id) && !sameValue(project, (candidate.sourceProjects || []).find((item) => item.id === project.id))) {
      commitErrors.push(`来源扫描越界修改了未在作用域中的项目 ${project.id}`);
    }
  }
  for (const instance of current.pageInstances || []) {
    if (!scope.has(instance.sourceProjectId) && !sameValue(instance, (candidate.pageInstances || []).find((item) => item.id === instance.id))) {
      commitErrors.push(`来源扫描越界修改了其他项目的页面实例 ${instance.id}`);
    }
  }
  for (const evidence of currentEvidence) {
    if (!scope.has(evidence.sourceProjectId) && !sameValue(evidence, candidateEvidenceById.get(evidence.id))) {
      commitErrors.push(`来源扫描越界修改了其他项目的证据 ${evidence.id}`);
    }
  }
}

if (commitErrors.length) {
  for (const error of [...new Set(commitErrors)]) console.error(`错误：${error}`);
  process.exit(1);
}

candidate.library = candidate.library || {};
candidate.library.updatedAt = new Date().toISOString();
record.committedRevision = candidate.revision;
record.committedAt = new Date().toISOString();

const transactionRoot = fs.mkdtempSync(path.join(internalRoot, ".commit-"));
const nextVisible = path.join(transactionRoot, "visible-next");
const nextKnowledge = path.join(transactionRoot, "knowledge-next.json");
const nextEvidence = path.join(transactionRoot, "evidence-next.jsonl");
const nextChanges = path.join(transactionRoot, "changes-next.jsonl");
const backupVisible = path.join(transactionRoot, "visible-backup");
const backupKnowledge = path.join(transactionRoot, "knowledge-backup.json");
const backupEvidence = path.join(transactionRoot, "evidence-backup.jsonl");
const backupChanges = path.join(transactionRoot, "changes-backup.jsonl");

fs.mkdirSync(nextVisible, { recursive: true });
for (const [relativePath, content] of renderKnowledge(candidate)) {
  const outputPath = path.join(nextVisible, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
}
fs.writeFileSync(nextKnowledge, jsonText(candidate), "utf8");
fs.writeFileSync(nextEvidence, candidateEvidence.map((item) => JSON.stringify(item)).join("\n") + (candidateEvidence.length ? "\n" : ""), "utf8");
const existingChanges = fs.existsSync(changesPath) ? fs.readFileSync(changesPath, "utf8") : "";
fs.writeFileSync(nextChanges, `${existingChanges}${JSON.stringify(record)}\n`, "utf8");

const state = { visible: false, knowledge: false, evidence: false, changes: false };
try {
  if (fs.existsSync(visiblePath)) fs.renameSync(visiblePath, backupVisible);
  fs.renameSync(nextVisible, visiblePath);
  state.visible = true;

  fs.renameSync(knowledgePath, backupKnowledge);
  fs.renameSync(nextKnowledge, knowledgePath);
  state.knowledge = true;

  if (fs.existsSync(evidencePath)) fs.renameSync(evidencePath, backupEvidence);
  fs.renameSync(nextEvidence, evidencePath);
  state.evidence = true;

  if (fs.existsSync(changesPath)) fs.renameSync(changesPath, backupChanges);
  fs.renameSync(nextChanges, changesPath);
  state.changes = true;
} catch (error) {
  try {
    if (state.changes && fs.existsSync(changesPath)) fs.renameSync(changesPath, nextChanges);
    if (fs.existsSync(backupChanges)) fs.renameSync(backupChanges, changesPath);
    if (state.evidence && fs.existsSync(evidencePath)) fs.renameSync(evidencePath, nextEvidence);
    if (fs.existsSync(backupEvidence)) fs.renameSync(backupEvidence, evidencePath);
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
  for (const warning of [...validation.warnings, ...evidenceValidation.warnings]) console.warn(`警告：${warning}`);
  console.log(`已提交 ${record.id}：revision ${candidate.revision}，${candidateEvidence.length} 条证据`);
}
