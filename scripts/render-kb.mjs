#!/usr/bin/env node
import path from "node:path";
import { INTERNAL_DIR, VISIBLE_DIR, readJson, validateKnowledgeData, writeRenderedViews } from "./kb-lib.mjs";

const target = path.resolve(process.argv[2] || ".");
const knowledgePath = path.join(target, INTERNAL_DIR, "knowledge.json");
let data;
try {
  data = readJson(knowledgePath);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const result = validateKnowledgeData(data);
if (result.errors.some((message) => !message.includes("不存在的证据"))) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}
writeRenderedViews(target, data);
console.log(`已生成统一知识库视图：${path.join(target, VISIBLE_DIR)}`);
