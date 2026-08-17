#!/usr/bin/env node
import path from "node:path";
import { validateRoot } from "./kb-lib.mjs";

const target = path.resolve(process.argv[2] || ".");
const result = validateRoot(target);
for (const warning of result.warnings) console.warn(`警告：${warning}`);
if (result.errors.length) {
  for (const error of result.errors) console.error(`错误：${error}`);
  process.exit(1);
}
console.log(`校验通过：revision ${result.data.revision}，${result.data.sourceProjects.length} 个来源项目、${result.data.pageInstances.length} 个页面实例、${result.data.scenarios.length} 个场景、${result.data.components.length} 个组件规范。`);
