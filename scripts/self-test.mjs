#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  INTERNAL_DIR,
  KNOWLEDGE_DIR,
  SCHEMA_VERSION,
  VISIBLE_DIR,
  emptyScanState,
  jsonText,
  readJson,
  readJsonl,
  validateKnowledgeData,
  validateRoot
} from "./kb-lib.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ui-kb-self-test-"));
const knowledgeRoot = path.join(fixtureRoot, "shared-knowledge");
fs.mkdirSync(knowledgeRoot);

function run(script, args) {
  return spawnSync(process.execPath, [path.join(scriptRoot, script), ...args], { encoding: "utf8" });
}

try {
  const sourceA = path.join(fixtureRoot, "source-a");
  const sourceB = path.join(fixtureRoot, "source-b");
  fs.mkdirSync(sourceA);
  fs.mkdirSync(sourceB);
  const derived = run("derive-source-key.mjs", [sourceA, "--id", "team-project-a"]);
  if (derived.status !== 0 || JSON.parse(derived.stdout).identity.stableKey !== "explicit:team-project-a") throw new Error("显式来源身份没有稳定生成");
  const pathOnly = run("derive-source-key.mjs", [sourceB]);
  if (pathOnly.status !== 2 || JSON.parse(pathOnly.stdout).status !== "ambiguous") throw new Error("只有本地路径时不应生成稳定来源身份");

  const initialized = run("init-kb.mjs", [knowledgeRoot, "--name", "团队 UI 设计知识库"]);
  if (initialized.status !== 0) throw new Error(`初始化失败：${initialized.stderr}`);
  const overwrite = run("init-kb.mjs", [knowledgeRoot]);
  if (overwrite.status !== 2) throw new Error("重复初始化没有被安全拒绝");

  const legacyPathRoot = path.join(fixtureRoot, "legacy-path");
  fs.mkdirSync(path.join(legacyPathRoot, ".ui-knowledge"), { recursive: true });
  const legacyInit = run("init-kb.mjs", [legacyPathRoot]);
  if (legacyInit.status !== 3) throw new Error("旧版根目录知识库没有被安全拒绝");
  if (fs.existsSync(path.join(legacyPathRoot, KNOWLEDGE_DIR))) throw new Error("检测到旧路径后仍然生成了 doc/ui");

  const currentPath = path.join(knowledgeRoot, INTERNAL_DIR, "knowledge.json");
  if (!fs.existsSync(path.join(knowledgeRoot, KNOWLEDGE_DIR))) throw new Error("知识库没有生成到 doc/ui");
  if (!fs.existsSync(path.join(knowledgeRoot, VISIBLE_DIR))) throw new Error("可见知识库没有生成到 doc/ui/UI设计知识库");
  const current = readJson(currentPath);
  if (current.schemaVersion !== SCHEMA_VERSION || current.library.mode !== "multi-project") throw new Error("初始化没有使用多项目 schema");
  for (const key of ["sourceProjects", "categories", "generalRules", "components", "scenarios", "pageInstances", "pending"]) {
    if (!Array.isArray(current[key]) || current[key].length !== 0) throw new Error(`初始化不应预置 ${key}`);
  }

  const candidate = structuredClone(current);
  candidate.revision = current.revision + 1;
  candidate.sourceProjects.push({
    id: "PRJ-SELF-TEST",
    name: "自检来源项目",
    kind: "frontend-project",
    sourceLocator: sourceA,
    identity: { stableKey: "self-test-project-a", aliases: ["source-a"] },
    profile: { purpose: "验证 A/B 项目可以向统一知识库贡献证据。" },
    unknowns: [],
    scanState: emptyScanState(),
    addedAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z"
  });
  candidate.generalRules.push({
    id: "R-SELF-TEST",
    title: "保留任务上下文",
    rule: "任务状态变化时保留用户已经确认的范围。",
    applicableWhen: ["任务跨越多个状态。"],
    avoidWhen: ["上下文已经失效。"],
    sourceProjectIds: ["PRJ-SELF-TEST"],
    evidenceRefs: ["E-SELF-TEST-A"],
    status: "candidate",
    confidence: "low"
  });
  const candidatePath = path.join(fixtureRoot, "candidate.json");
  const recordPath = path.join(fixtureRoot, "record.json");
  const evidenceCandidatePath = path.join(fixtureRoot, "evidence-a.jsonl");
  fs.writeFileSync(candidatePath, jsonText(candidate), "utf8");
  fs.writeFileSync(evidenceCandidatePath, `${JSON.stringify({
    id: "E-SELF-TEST-A",
    sourceProjectId: "PRJ-SELF-TEST",
    kind: "test",
    locator: "temporary-fixture-a",
    summary: "验证来源 A 的知识和证据原子提交。",
    supports: ["R-SELF-TEST"],
    capturedAt: "2026-08-17T00:00:00.000Z"
  })}\n`, "utf8");
  fs.writeFileSync(recordPath, jsonText({
    id: "CR-SELF-TEST",
    baseRevision: current.revision,
    type: "source-scan",
    sourceProjectIds: ["PRJ-SELF-TEST"],
    summary: "登记统一知识库的第一个来源项目。",
    targets: ["PRJ-SELF-TEST"],
    impactIds: [],
    conflicts: [],
    decision: "confirmed",
    reason: "自动化自检"
  }), "utf8");

  const committed = run("commit-kb.mjs", [knowledgeRoot, candidatePath, recordPath, evidenceCandidatePath]);
  if (committed.status !== 0) throw new Error(`提交失败：${committed.stderr}`);
  const result = validateRoot(knowledgeRoot);
  if (result.errors.length) throw new Error(`提交后校验失败：${result.errors.join("；")}`);
  if (result.data.revision !== 2 || result.data.sourceProjects.length !== 1) throw new Error("提交后 revision 或来源项目不正确");
  const history = readJsonl(path.join(knowledgeRoot, INTERNAL_DIR, "changes.jsonl"));
  if (history.length !== 1 || history[0].id !== "CR-SELF-TEST") throw new Error("变更历史没有正确追加");
  if (readJsonl(path.join(knowledgeRoot, INTERNAL_DIR, "evidence.jsonl")).length !== 1) throw new Error("来源 A 的证据没有原子提交");

  const secondCandidate = structuredClone(result.data);
  secondCandidate.revision = result.data.revision + 1;
  secondCandidate.sourceProjects.push({
    id: "PRJ-SELF-TEST-B",
    name: "第二个来源项目",
    kind: "frontend-project",
    sourceLocator: sourceB,
    identity: { stableKey: "self-test-project-b", aliases: ["source-b"] },
    profile: { purpose: "验证 B 项目补充时保留 A 项目。" },
    unknowns: [],
    scanState: emptyScanState(),
    addedAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z"
  });
  secondCandidate.generalRules[0].sourceProjectIds.push("PRJ-SELF-TEST-B");
  secondCandidate.generalRules[0].evidenceRefs.push("E-SELF-TEST-B");
  const secondCandidatePath = path.join(fixtureRoot, "candidate-b.json");
  const secondRecordPath = path.join(fixtureRoot, "record-b.json");
  const secondEvidencePath = path.join(fixtureRoot, "evidence-b.jsonl");
  fs.writeFileSync(secondCandidatePath, jsonText(secondCandidate), "utf8");
  const secondEvidence = [
    ...readJsonl(evidenceCandidatePath),
    {
      id: "E-SELF-TEST-B",
      sourceProjectId: "PRJ-SELF-TEST-B",
      kind: "test",
      locator: "temporary-fixture-b",
      summary: "验证来源 B 补充共享规则时保留来源 A。",
      supports: ["R-SELF-TEST"],
      capturedAt: "2026-08-17T00:00:00.000Z"
    }
  ];
  fs.writeFileSync(secondEvidencePath, secondEvidence.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
  fs.writeFileSync(secondRecordPath, jsonText({
    id: "CR-SELF-TEST-B",
    baseRevision: result.data.revision,
    type: "source-scan",
    sourceProjectIds: ["PRJ-SELF-TEST-B"],
    summary: "登记第二个来源项目且保留第一个项目。",
    targets: ["PRJ-SELF-TEST-B"],
    impactIds: ["PRJ-SELF-TEST"],
    conflicts: [],
    decision: "confirmed",
    reason: "自动化自检"
  }), "utf8");
  const secondCommitted = run("commit-kb.mjs", [knowledgeRoot, secondCandidatePath, secondRecordPath, secondEvidencePath]);
  if (secondCommitted.status !== 0) throw new Error(`第二来源项目提交失败：${secondCommitted.stderr}`);
  const accumulated = validateRoot(knowledgeRoot);
  if (accumulated.errors.length || accumulated.data.revision !== 3 || accumulated.data.sourceProjects.length !== 2) throw new Error("B 项目补充后没有保留 A 项目或版本不正确");

  const stale = run("commit-kb.mjs", [knowledgeRoot, candidatePath, recordPath, evidenceCandidatePath]);
  if (stale.status === 0) throw new Error("过期 baseRevision 没有被拒绝");
  if (readJson(currentPath).revision !== 3) throw new Error("失败提交改变了当前版本");

  const destructiveCandidate = structuredClone(accumulated.data);
  destructiveCandidate.revision = accumulated.data.revision + 1;
  destructiveCandidate.sourceProjects = destructiveCandidate.sourceProjects.filter((item) => item.id !== "PRJ-SELF-TEST");
  destructiveCandidate.generalRules[0].sourceProjectIds = ["PRJ-SELF-TEST-B"];
  destructiveCandidate.generalRules[0].evidenceRefs = ["E-SELF-TEST-B"];
  const destructivePath = path.join(fixtureRoot, "candidate-destructive.json");
  const destructiveRecordPath = path.join(fixtureRoot, "record-destructive.json");
  const destructiveEvidencePath = path.join(fixtureRoot, "evidence-destructive.jsonl");
  fs.writeFileSync(destructivePath, jsonText(destructiveCandidate), "utf8");
  fs.writeFileSync(destructiveEvidencePath, `${JSON.stringify(secondEvidence[1])}\n`, "utf8");
  fs.writeFileSync(destructiveRecordPath, jsonText({
    id: "CR-DESTRUCTIVE-TEST",
    baseRevision: accumulated.data.revision,
    type: "source-scan",
    sourceProjectIds: ["PRJ-SELF-TEST-B"],
    summary: "模拟 B 项目候选误删 A 项目。",
    targets: ["PRJ-SELF-TEST-B"],
    impactIds: [], conflicts: [], decision: "confirmed", reason: "自动化负向测试"
  }), "utf8");
  const destructive = run("commit-kb.mjs", [knowledgeRoot, destructivePath, destructiveRecordPath, destructiveEvidencePath]);
  if (destructive.status === 0 || !destructive.stderr.includes("删除了既有对象 PRJ-SELF-TEST")) throw new Error("B 项目误删 A 项目没有被提交器拒绝");
  if (readJson(currentPath).revision !== 3 || readJsonl(path.join(knowledgeRoot, INTERNAL_DIR, "evidence.jsonl")).length !== 2) throw new Error("被拒绝的破坏性提交改变了知识或证据");

  const migrationRoot = path.join(fixtureRoot, "migration-fixture");
  const migrationInternal = path.join(migrationRoot, INTERNAL_DIR);
  fs.mkdirSync(migrationInternal, { recursive: true });
  fs.writeFileSync(path.join(migrationInternal, "knowledge.json"), jsonText({
    schemaVersion: "1.1.0",
    revision: 1,
    project: { name: "旧项目", mode: "source-scan", language: "zh-CN", profile: {}, unknowns: [], createdAt: null, updatedAt: null },
    contextPolicy: {},
    scanState: emptyScanState(),
    categories: [], generalRules: [], components: [], pageArchetypes: [], scenarios: [], pages: [], modules: [], pending: []
  }), "utf8");
  fs.writeFileSync(path.join(migrationInternal, "evidence.jsonl"), "", "utf8");
  fs.writeFileSync(path.join(migrationInternal, "changes.jsonl"), "", "utf8");
  const migrated = run("migrate-kb.mjs", [migrationRoot, "--source-root", path.join(fixtureRoot, "old-source")]);
  if (migrated.status !== 0) throw new Error(`迁移失败：${migrated.stderr}`);
  const migratedData = readJson(path.join(migrationInternal, "knowledge.json"));
  if (migratedData.schemaVersion !== SCHEMA_VERSION || migratedData.sourceProjects.length !== 1) throw new Error("旧 schema 没有正确迁移");
  if (fs.existsSync(path.join(migrationRoot, VISIBLE_DIR, "页面"))) throw new Error("迁移后仍然生成独立页面目录");

  const demoRoot = path.resolve(scriptRoot, "..", "ui-knowledge-demo", INTERNAL_DIR);
  const demo = readJson(path.join(demoRoot, "knowledge.json"));
  const demoEvidence = readJsonl(path.join(demoRoot, "evidence.jsonl"));
  const demoResult = validateKnowledgeData(demo, demoEvidence);
  if (demoResult.errors.length) throw new Error(`演示结构校验失败：${demoResult.errors.join("；")}`);
  const incomplete = structuredClone(demo);
  delete incomplete.scenarios[0].semanticProfile;
  if (!validateKnowledgeData(incomplete, demoEvidence).errors.length) throw new Error("缺少场景语义画像没有被拒绝");
  const duplicateScenario = structuredClone(demo);
  duplicateScenario.scenarios.push({ ...structuredClone(duplicateScenario.scenarios[0]), id: "S-DUPLICATE", title: "重复语义场景" });
  if (!validateKnowledgeData(duplicateScenario, demoEvidence).errors.some((item) => item.includes("semanticKey 重复"))) throw new Error("重复场景语义键没有被拒绝");

  console.log("自检通过：稳定来源身份、统一知识库初始化、A/B 来源累计、证据原子提交、越界删除拒绝、v1 迁移、场景主知识、内部页面实例、语义去重与版本冲突拒绝。" );
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
