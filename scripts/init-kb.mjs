#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INTERNAL_DIR, VISIBLE_DIR, jsonText, readJson, validateRoot, writeRenderedViews } from "./kb-lib.mjs";

const target = path.resolve(process.argv[2] || ".");
const force = process.argv.includes("--force");
const nameIndex = process.argv.indexOf("--name");
if (nameIndex >= 0 && !process.argv[nameIndex + 1]) {
  console.error("--name 需要一个知识库名称。");
  process.exit(2);
}
const libraryName = nameIndex >= 0 ? process.argv[nameIndex + 1] : `${path.basename(target)} UI 设计知识库`;
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(scriptRoot, "..", "assets", "templates", "knowledge.template.json");
const internalRoot = path.join(target, INTERNAL_DIR);
const visibleRoot = path.join(target, VISIBLE_DIR);
const knowledgePath = path.join(internalRoot, "knowledge.json");
const legacyInternalRoot = path.join(target, ".ui-knowledge");
const legacyVisibleRoot = path.join(target, "UI设计知识库");

if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
  console.error(`目标目录不存在：${target}`);
  process.exit(1);
}
if (fs.existsSync(legacyInternalRoot) || fs.existsSync(legacyVisibleRoot)) {
  console.error("检测到知识库根目录中的旧版路径。插件只使用 doc/ui；为避免形成两套事实源，不会自动初始化或读取旧路径，请先确认迁移到 doc/ui。");
  process.exit(3);
}
if (!force && (fs.existsSync(knowledgePath) || fs.existsSync(visibleRoot))) {
  console.error("目标目录中已经存在知识库；默认不会覆盖。若确实要重建，请先人工确认并使用 --force。");
  process.exit(2);
}

const data = readJson(templatePath);
const now = new Date().toISOString();
data.library.name = libraryName;
data.library.createdAt = now;
data.library.updatedAt = now;

fs.mkdirSync(internalRoot, { recursive: true });
fs.writeFileSync(knowledgePath, jsonText(data), "utf8");
fs.writeFileSync(path.join(internalRoot, "evidence.jsonl"), "", "utf8");
fs.writeFileSync(path.join(internalRoot, "changes.jsonl"), "", "utf8");
writeRenderedViews(target, data);

const result = validateRoot(target);
if (result.errors.length) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}
console.log(`已初始化统一知识库：${target}`);
for (const warning of result.warnings) console.warn(`警告：${warning}`);
