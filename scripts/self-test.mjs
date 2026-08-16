#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { INTERNAL_DIR, KNOWLEDGE_DIR, VISIBLE_DIR, jsonText, readJson, readJsonl, validateKnowledgeData, validateRoot } from "./kb-lib.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ui-kb-self-test-"));
const projectRoot = path.join(fixtureRoot, "sample-project");
fs.mkdirSync(projectRoot);

function run(script, args) {
  return spawnSync(process.execPath, [path.join(scriptRoot, script), ...args], { encoding: "utf8" });
}

try {
  const initialized = run("init-kb.mjs", [projectRoot]);
  if (initialized.status !== 0) throw new Error(`初始化失败：${initialized.stderr}`);

  const overwrite = run("init-kb.mjs", [projectRoot]);
  if (overwrite.status !== 2) throw new Error("重复初始化没有被安全拒绝");

  const legacyProject = path.join(fixtureRoot, "legacy-project");
  fs.mkdirSync(path.join(legacyProject, ".ui-knowledge"), { recursive: true });
  const legacyInit = run("init-kb.mjs", [legacyProject]);
  if (legacyInit.status !== 3) throw new Error("旧版根目录知识库没有被安全拒绝");
  if (fs.existsSync(path.join(legacyProject, KNOWLEDGE_DIR))) throw new Error("检测到旧路径后仍然生成了 doc/ui");

  const currentPath = path.join(projectRoot, INTERNAL_DIR, "knowledge.json");
  if (!fs.existsSync(path.join(projectRoot, KNOWLEDGE_DIR))) throw new Error("知识库没有生成到 doc/ui");
  if (!fs.existsSync(path.join(projectRoot, VISIBLE_DIR))) throw new Error("可见知识库没有生成到 doc/ui/UI设计知识库");
  if (fs.existsSync(path.join(projectRoot, ".ui-knowledge")) || fs.existsSync(path.join(projectRoot, "UI设计知识库"))) {
    throw new Error("项目根目录不应生成旧版知识库路径");
  }
  const current = readJson(currentPath);
  for (const key of ["categories", "generalRules", "components", "pageArchetypes", "scenarios", "pages", "modules", "pending"]) {
    if (!Array.isArray(current[key]) || current[key].length !== 0) throw new Error(`初始化不应预置 ${key}`);
  }
  const candidate = structuredClone(current);
  candidate.revision = current.revision + 1;
  candidate.project.profile.selfTest = "passed";

  const candidatePath = path.join(fixtureRoot, "candidate.json");
  const recordPath = path.join(fixtureRoot, "record.json");
  fs.writeFileSync(candidatePath, jsonText(candidate), "utf8");
  fs.writeFileSync(recordPath, jsonText({
    id: "CR-SELF-TEST",
    baseRevision: current.revision,
    type: "normative-rule",
    summary: "验证受控提交可以原子更新版本与派生视图。",
    targets: [],
    impactIds: [],
    conflicts: [],
    decision: "confirmed",
    reason: "自动化自检"
  }), "utf8");

  const committed = run("commit-kb.mjs", [projectRoot, candidatePath, recordPath]);
  if (committed.status !== 0) throw new Error(`提交失败：${committed.stderr}`);

  const result = validateRoot(projectRoot);
  if (result.errors.length) throw new Error(`提交后校验失败：${result.errors.join("；")}`);
  if (result.data.revision !== 2) throw new Error("提交后 revision 不正确");
  const history = readJsonl(path.join(projectRoot, INTERNAL_DIR, "changes.jsonl"));
  if (history.length !== 1 || history[0].id !== "CR-SELF-TEST") throw new Error("变更历史没有正确追加");

  const stale = run("commit-kb.mjs", [projectRoot, candidatePath, recordPath]);
  if (stale.status === 0) throw new Error("过期 baseRevision 没有被拒绝");
  if (readJson(currentPath).revision !== 2) throw new Error("失败提交改变了当前版本");

  const demoRoot = path.resolve(scriptRoot, "..", "ui-knowledge-demo", INTERNAL_DIR);
  const demo = readJson(path.join(demoRoot, "knowledge.json"));
  const demoEvidence = new Set(readJsonl(path.join(demoRoot, "evidence.jsonl")).map((item) => item.id));
  const demoResult = validateKnowledgeData(demo, demoEvidence);
  if (demoResult.errors.length) throw new Error(`三层演示结构校验失败：${demoResult.errors.join("；")}`);

  const incomplete = structuredClone(demo);
  delete incomplete.scenarios[0].componentRecipe;
  if (!validateKnowledgeData(incomplete, demoEvidence).errors.length) {
    throw new Error("缺少组件配方的场景没有被拒绝");
  }

  console.log("自检通过：doc/ui 空知识初始化、旧路径拒绝、三层派生与关系校验、确认提交、版本冲突拒绝。" );
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
