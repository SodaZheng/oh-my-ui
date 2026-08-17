#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sourceArg = process.argv[2];
const idIndex = process.argv.indexOf("--id");
const nameIndex = process.argv.indexOf("--name");
if (!sourceArg || (idIndex >= 0 && !process.argv[idIndex + 1]) || (nameIndex >= 0 && !process.argv[nameIndex + 1])) {
  console.error("用法：derive-source-key.mjs <sourceRoot> [--id <明确项目ID>] [--name <项目清单名称>]");
  process.exit(2);
}

const sourceRoot = path.resolve(sourceArg);
if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
  console.error(`来源项目目录不存在：${sourceRoot}`);
  process.exit(1);
}

function option(index) {
  return index >= 0 ? process.argv[index + 1].trim() : "";
}

function normalizeRemote(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const scp = value.match(/^[^@\s]+@([^:\s]+):(.+)$/);
  if (scp) return `${scp[1].toLowerCase()}/${scp[2].replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "")}`;
  try {
    const url = new URL(value);
    if (url.protocol === "file:") return "";
    const repositoryPath = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
    return repositoryPath ? `${url.hostname.toLowerCase()}/${repositoryPath}` : "";
  } catch {
    return "";
  }
}

const explicitId = option(idIndex);
const gitResult = spawnSync("git", ["-C", sourceRoot, "config", "--get", "remote.origin.url"], { encoding: "utf8" });
const repositoryRemote = gitResult.status === 0 ? normalizeRemote(gitResult.stdout) : "";
let manifestName = option(nameIndex);
const manifestPath = path.join(sourceRoot, "package.json");
if (!manifestName && fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name === "string") manifestName = manifest.name.trim();
  } catch {
    // A malformed manifest is not a stable identity signal; the caller can supply --name or --id.
  }
}

let stableKey = "";
if (explicitId) stableKey = `explicit:${explicitId}`;
else if (repositoryRemote) stableKey = `repo:${repositoryRemote}${manifestName ? `#manifest:${manifestName}` : ""}`;

const result = {
  status: stableKey ? "resolved" : "ambiguous",
  identity: {
    stableKey,
    aliases: [path.basename(sourceRoot), sourceRoot],
    signals: {
      repositoryRemote: repositoryRemote || null,
      manifestName: manifestName || null,
      explicitId: explicitId || null
    }
  }
};
console.log(JSON.stringify(result, null, 2));
if (!stableKey) {
  console.error("无法从非路径信号生成稳定身份。请提供 --id，或确认仓库远端/项目清单名称后再登记来源项目。");
  process.exit(2);
}
