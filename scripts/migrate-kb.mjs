#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  INTERNAL_DIR,
  SCHEMA_VERSION,
  emptyScanState,
  jsonText,
  readJson,
  readJsonl,
  validateKnowledgeData,
  writeRenderedViews
} from "./kb-lib.mjs";

const target = path.resolve(process.argv[2] || ".");
const sourceIndex = process.argv.indexOf("--source-root");
if (sourceIndex >= 0 && !process.argv[sourceIndex + 1]) {
  console.error("--source-root 需要一个来源项目目录。");
  process.exit(2);
}
const sourceRoot = path.resolve(sourceIndex >= 0 ? process.argv[sourceIndex + 1] : target);
const internalRoot = path.join(target, INTERNAL_DIR);
const knowledgePath = path.join(internalRoot, "knowledge.json");
const evidencePath = path.join(internalRoot, "evidence.jsonl");
const changesPath = path.join(internalRoot, "changes.jsonl");

if (!fs.existsSync(knowledgePath)) {
  console.error(`缺少待迁移知识库：${knowledgePath}`);
  process.exit(1);
}

const legacy = readJson(knowledgePath);
if (legacy.schemaVersion === SCHEMA_VERSION) {
  console.log(`知识库已经是 schema ${SCHEMA_VERSION}，无需迁移。`);
  process.exit(0);
}
if (legacy.schemaVersion !== "1.1.0") {
  console.error(`只支持从 schema 1.1.0 迁移，当前为 ${legacy.schemaVersion || "未知"}。`);
  process.exit(2);
}

const legacyEvidence = readJsonl(evidencePath);
const legacyChanges = readJsonl(changesPath);
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8).toUpperCase();
const sourceKind = legacy.project?.mode === "synthetic-demo" ? "synthetic-demo" : "frontend-project";
const sourceLocator = sourceKind === "synthetic-demo" ? "synthetic-demo" : sourceRoot;
const sourceProjectId = `PRJ-${digest(`${legacy.project?.name || path.basename(sourceRoot)}\n${sourceLocator}`)}`;
const pageIdMap = new Map((legacy.pages || []).map((page) => [page.id, page.id?.startsWith("PG-") ? `PI-${page.id.slice(3)}` : `PI-${digest(page.id || page.title)}`]));
const archetypeById = new Map((legacy.pageArchetypes || []).map((item) => [item.id, item]));
const categoryById = new Map((legacy.categories || []).map((item) => [item.id, item]));
const moduleByPageId = new Map();
for (const module of legacy.modules || []) for (const pageId of module.pageIds || []) moduleByPageId.set(pageId, module.title);

const pageInstances = (legacy.pages || []).map((page) => ({
  id: pageIdMap.get(page.id),
  sourceProjectId,
  sourceLocator,
  title: page.title,
  summary: page.summary,
  businessModule: moduleByPageId.get(page.id) || "未归类业务模块",
  pageForm: archetypeById.get(page.pageArchetypeId)?.title || "页面形态待确认",
  userGoal: page.userGoal,
  entry: page.entry,
  scenarioIds: page.scenarioIds || [],
  pageStructure: page.pageStructure,
  interactionFlow: page.interactionFlow,
  states: page.states,
  responsiveRules: page.responsiveRules,
  designBoundaries: page.designBoundaries,
  coverage: page.coverage,
  evidenceRefs: page.evidenceRefs || [],
  status: page.status,
  confidence: page.confidence
}));

const scenarios = (legacy.scenarios || []).map((scenario) => {
  const examplePages = (legacy.pages || []).filter((page) => page.scenarioIds?.includes(scenario.id));
  const exemplar = examplePages.find((page) => page.scenarioIds?.[0] === scenario.id);
  const oldLayout = exemplar?.pageStructure?.layout;
  const form = archetypeById.get(scenario.pageArchetypeId)?.title || "页面形态待确认";
  const semanticProfile = {
    userGoal: scenario.userGoal,
    objectScope: (scenario.applicableWhen || [])[0] || "对象范围待跨项目归并",
    taskStage: categoryById.get(scenario.categoryId)?.title || "任务阶段待确认",
    duration: "处理时长待跨项目归并",
    risk: "风险条件待跨项目归并",
    result: scenario.summary
  };
  return {
    ...scenario,
    semanticKey: `SCENE-${digest(Object.values(semanticProfile).join("\n"))}`,
    semanticProfile,
    pagePattern: {
      form,
      summary: scenario.pageShape?.summary || scenario.summary,
      layout: {
        direction: oldLayout?.direction || "主布局方向待跨项目归并",
        primary: oldLayout?.primary || "主区域待跨项目归并",
        secondary: oldLayout?.secondary || "次要区域待跨项目归并",
        relationships: oldLayout?.relationships?.length ? oldLayout.relationships : ["区域关系待跨项目归并"]
      },
      orderedRegions: scenario.pageShape?.orderedRegions || []
    },
    variants: [],
    exampleInstanceIds: examplePages.map((page) => pageIdMap.get(page.id)),
    sourceProjectIds: [sourceProjectId]
  };
});
for (const scenario of scenarios) {
  delete scenario.pageArchetypeId;
  delete scenario.pageShape;
}

const migratedEvidence = legacyEvidence.map((item) => ({
  ...item,
  sourceProjectId,
  supports: (item.supports || []).map((id) => pageIdMap.get(id) || id)
}));
const now = new Date().toISOString();
const legacyName = legacy.project?.name || path.basename(target);
const libraryName = /UI\s*设计知识库/.test(legacyName) ? legacyName : `${legacyName} UI 设计知识库`;
const migrated = {
  schemaVersion: SCHEMA_VERSION,
  revision: legacy.revision + 1,
  library: {
    name: libraryName,
    mode: "multi-project",
    language: legacy.project?.language || "zh-CN",
    disclaimer: legacy.project?.disclaimer || "本知识库由多个项目证据持续补充；跨项目重复只能提高证据广度，不能自动成为正式规范。",
    createdAt: legacy.project?.createdAt || now,
    updatedAt: now
  },
  contextPolicy: {
    ...(legacy.contextPolicy || {}),
    retrievalOrder: ["导航与摘要", "候选场景", "相关项目页面实例", "组件规范", "按需证据"]
  },
  sourceProjects: [{
    id: sourceProjectId,
    name: legacy.project?.name || path.basename(sourceRoot),
    kind: sourceKind,
    sourceLocator,
    identity: {
      stableKey: `legacy:${digest(legacy.project?.name || path.basename(sourceRoot))}`,
      aliases: [legacy.project?.name || path.basename(sourceRoot), sourceLocator]
    },
    profile: legacy.project?.profile || {},
    unknowns: legacy.project?.unknowns || [],
    scanState: legacy.scanState || emptyScanState(),
    addedAt: legacy.project?.createdAt || now,
    updatedAt: legacy.project?.updatedAt || now
  }],
  categories: legacy.categories || [],
  generalRules: (legacy.generalRules || []).map((item) => ({ ...item, sourceProjectIds: [sourceProjectId] })),
  components: (legacy.components || []).map((item) => ({ ...item, sourceProjectIds: [sourceProjectId] })),
  scenarios,
  pageInstances,
  pending: (legacy.pending || []).map((item) => ({ ...item, relatedInstanceIds: (item.relatedPageIds || []).map((id) => pageIdMap.get(id)).filter(Boolean) }))
};

const validation = validateKnowledgeData(migrated, migratedEvidence);
if (validation.errors.length) {
  for (const error of validation.errors) console.error(`错误：${error}`);
  process.exit(1);
}

const stamp = now.replace(/[:.]/g, "-");
const backupRoot = path.join(internalRoot, `.migration-v1-backup-${stamp}`);
fs.mkdirSync(backupRoot, { recursive: true });
for (const file of ["knowledge.json", "evidence.jsonl", "changes.jsonl"]) {
  const from = path.join(internalRoot, file);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(backupRoot, file));
}
const migrationRecord = {
  id: `CR-MIGRATE-${stamp}`,
  baseRevision: legacy.revision,
  committedRevision: migrated.revision,
  type: "schema-migration",
  summary: "将项目级页面蓝图迁移为多项目知识库中的内部页面实例。",
  targets: [...pageIdMap.values()],
  impactIds: scenarios.map((item) => item.id),
  conflicts: [],
  decision: "confirmed",
  reason: "升级到场景主知识与跨项目累计模型",
  committedAt: now
};

fs.writeFileSync(knowledgePath, jsonText(migrated), "utf8");
fs.writeFileSync(evidencePath, migratedEvidence.map((item) => JSON.stringify(item)).join("\n") + (migratedEvidence.length ? "\n" : ""), "utf8");
fs.writeFileSync(changesPath, [...legacyChanges, migrationRecord].map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
writeRenderedViews(target, migrated);

for (const warning of validation.warnings) console.warn(`警告：${warning}`);
console.log(`迁移完成：schema ${SCHEMA_VERSION}，revision ${migrated.revision}`);
console.log(`旧事实源备份：${backupRoot}`);
