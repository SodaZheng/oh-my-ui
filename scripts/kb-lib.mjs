import fs from "node:fs";
import path from "node:path";

export const SCHEMA_VERSION = "2.0.0";
export const KNOWLEDGE_DIR = path.join("doc", "ui");
export const VISIBLE_DIR = path.join(KNOWLEDGE_DIR, "UI设计知识库");
export const INTERNAL_DIR = path.join(KNOWLEDGE_DIR, ".ui-knowledge");

const STATUS_LABELS = {
  observed: "现状观察",
  candidate: "候选规律",
  normative: "正式规范",
  exception: "限定例外",
  hypothesis: "待验证想法"
};
const CONFIDENCE_LABELS = { low: "低", medium: "中", high: "高" };
const SOURCE_KIND_LABELS = { "frontend-project": "前端项目", "synthetic-demo": "人工合成演示", "human-reference": "人工资料" };
const EMPTY_COVERAGE = { total: 0, complete: 0, needsRuntime: 0, excluded: 0, uncovered: 0 };

export function emptyScanState() {
  return {
    status: "initialized",
    routeLedger: [],
    componentLedger: [],
    coverage: { ...EMPTY_COVERAGE },
    componentCoverage: { ...EMPTY_COVERAGE },
    blindSpots: []
  };
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${index + 1} 不是合法 JSON：${error.message}`);
    }
  });
}

export function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function list(items, emptyText = "暂无。") {
  return Array.isArray(items) && items.length ? items.map((item) => `- ${item}`).join("\n") : emptyText;
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}

function knowledgeState(item) {
  return `**知识状态：** ${STATUS_LABELS[item.status] || item.status}　 **可信度：** ${CONFIDENCE_LABELS[item.confidence] || item.confidence}`;
}

function componentLink(component, label = component?.title) {
  if (!component) return label || "未识别组件";
  return component.file ? `[${label || component.title}](../组件/${component.file})` : (label || component.title);
}

function projectNames(ids, projectById) {
  return (ids || []).map((id) => projectById.get(id)?.name).filter(Boolean);
}

function scenarioLink(scenario, categoryById) {
  if (!scenario) return "待确认";
  const category = categoryById.get(scenario.categoryId);
  return category ? `[${scenario.title}](场景/${category.file}#${scenario.title})` : scenario.title;
}

function recipeItems(items, componentById, kind) {
  return (items || []).map((item) => {
    const component = componentById.get(item.componentId);
    const details = [
      item.role ? `角色：${item.role}` : "",
      item.placement ? `位置：${item.placement}` : "",
      item.when ? `条件：${item.when}` : "",
      item.reason ? `理由：${item.reason}` : ""
    ].filter(Boolean).join("；");
    return `- **${kind} · ${componentLink(component)}**${details ? `：${details}` : ""}`;
  });
}

function scenarioMarkdown(scenario, scenarioById, componentById, projectById, instanceById) {
  const pattern = scenario.pagePattern || {};
  const layout = pattern.layout || {};
  const regionLines = (pattern.orderedRegions || []).map((region, index) => `${index + 1}. ${region.name}：${region.purpose}`);
  const compositionLines = (scenario.composition || []).map((item) => `**${item.name}**：${item.purpose}${item.when ? ` 出现条件：${item.when}` : ""}`);
  const stateLines = (scenario.states || []).map((state) => `**${state.name}**：${state.expectation}`);
  const recipe = scenario.componentRecipe || {};
  const recipeLines = [
    ...recipeItems(recipe.required, componentById, "必需"),
    ...recipeItems(recipe.conditional, componentById, "条件出现"),
    ...recipeItems(recipe.avoid, componentById, "避免")
  ];
  const relationLines = [];
  const leads = (scenario.relations?.mayLeadTo || []).map((id) => scenarioById.get(id)?.title).filter(Boolean);
  const related = (scenario.relations?.related || []).map((id) => scenarioById.get(id)?.title).filter(Boolean);
  if (leads.length) relationLines.push(`- 后续可能进入：${leads.join("、")}`);
  if (related.length) relationLines.push(`- 常与以下场景组合：${related.join("、")}`);
  const variantLines = (scenario.variants || []).map((variant) => {
    const sources = projectNames(variant.sourceProjectIds, projectById);
    return `- **${variant.title}**：适用条件：${variant.conditions.join("；")}；差异：${variant.differences.join("；")}；来源：${sources.join("、") || "人工补充"}`;
  });
  const exampleLines = (scenario.exampleInstanceIds || []).map((id) => {
    const instance = instanceById.get(id);
    if (!instance) return null;
    const project = projectById.get(instance.sourceProjectId);
    return `- **${instance.title}**（${project?.name || "未知来源项目"}）：${instance.summary}`;
  }).filter(Boolean);
  const sources = projectNames(scenario.sourceProjectIds, projectById);

  return [
    `## ${scenario.title}`, "", `> ${scenario.summary}`, "", knowledgeState(scenario), "",
    "### 用户任务", "", scenario.userGoal, "",
    "### 适用场景", "", list(scenario.applicableWhen), "",
    "### 不适用场景", "", list(scenario.avoidWhen), "",
    "### 推荐页面形态与布局骨架", "",
    `**${pattern.form || "页面形态待确认"}。** ${pattern.summary || "布局规律待确认。"}`, "",
    `- 主布局方向：${layout.direction || "待确认"}`,
    `- 主区域：${layout.primary || "待确认"}`,
    `- 次要区域：${layout.secondary || "待确认"}`,
    ...(layout.relationships || []).map((item) => `- ${item}`), "",
    "页面从进入到主要内容的空间顺序：", "", regionLines.join("\n") || "暂无。", "",
    "### 功能组合", "", list(compositionLines), "",
    "### 组件搭配配方", "", recipeLines.join("\n") || "暂无。", "",
    "### 完成任务的顺序", "", (scenario.interactionFlow || []).map((step, index) => `${index + 1}. ${step}`).join("\n") || "暂无。", "",
    "### 关键状态", "", list(stateLines), "",
    "### 跨项目变体", "", variantLines.join("\n") || "当前没有需要单独保留的跨项目变体。", "",
    "### 真实项目案例", "", exampleLines.join("\n") || "当前没有完成收录的项目页面实例。", "",
    "更多来源与实例可查看 [来源项目索引](../03-来源项目索引.md) 和 [项目案例索引](../05-项目案例索引.md)。", "",
    "### 场景关系", "", relationLines.join("\n") || "暂无直接关系。", "",
    "### 设计边界", "", list(scenario.designBoundaries), "",
    `**证据来源项目：** ${sources.join("、") || "暂无项目证据"}`, ""
  ].join("\n");
}

function componentMarkdown(component, scenarioById, componentById, projectById) {
  const scenarioLines = (component.scenarioRoles || []).map((item) => {
    const title = scenarioById.get(item.scenarioId)?.title || item.scenarioId;
    return `- **${title}**：${item.role}${item.when ? `；出现条件：${item.when}` : ""}`;
  });
  const compositionLines = (component.compositionRules || []).map((item) => {
    const peer = componentById.get(item.withComponentId);
    return `- 与 **${componentLink(peer)}** ${item.relationship}${item.when ? `；条件：${item.when}` : ""}`;
  });
  const states = (component.states || []).map((state) => `- **${state.name}**：${state.expectation}`);
  const sources = projectNames(component.sourceProjectIds, projectById);
  return [
    `# ${component.title}`, "", `> ${component.summary}`, "", knowledgeState(component), "",
    section("解决的问题", component.purpose),
    section("适用场景", list(component.applicableWhen)),
    section("不适用场景", list(component.avoidWhen)),
    section("在任务场景中的角色", scenarioLines.join("\n") || "暂无。"),
    section("与其他组件的组合关系", compositionLines.join("\n") || "暂无。"),
    section("内容规则", list(component.contentRules)),
    section("布局规则", list(component.layoutRules)),
    section("交互规则", list(component.interactionRules)),
    section("组件状态", states.join("\n") || "暂无。"),
    section("证据来源项目", sources.join("、") || "暂无项目证据。")
  ].join("\n").trimEnd() + "\n";
}

function aggregateCoverage(sourceProjects, field) {
  const total = { ...EMPTY_COVERAGE };
  for (const project of sourceProjects) {
    const coverage = project.scanState?.[field] || {};
    for (const key of Object.keys(total)) total[key] += Number.isInteger(coverage[key]) ? coverage[key] : 0;
  }
  return total;
}

export function renderKnowledge(data) {
  const files = new Map();
  const scenarios = data.scenarios || [];
  const instances = data.pageInstances || [];
  const components = data.components || [];
  const sourceProjects = data.sourceProjects || [];
  const scenarioById = new Map(scenarios.map((item) => [item.id, item]));
  const instanceById = new Map(instances.map((item) => [item.id, item]));
  const componentById = new Map(components.map((item) => [item.id, item]));
  const projectById = new Map(sourceProjects.map((item) => [item.id, item]));
  const categoryById = new Map((data.categories || []).map((item) => [item.id, item]));
  const coverage = aggregateCoverage(sourceProjects, "coverage");
  const componentCoverage = aggregateCoverage(sourceProjects, "componentCoverage");
  const disclaimer = data.library?.disclaimer || "候选内容不等于已确认设计规范。";

  const navRows = scenarios.map((scenario) => {
    const category = categoryById.get(scenario.categoryId);
    const title = category ? `[${scenario.title}](场景/${category.file}#${scenario.title})` : scenario.title;
    const sources = projectNames(scenario.sourceProjectIds, projectById);
    return `| ${title} | ${category?.title || "未分类"} | ${sources.join("、") || "人工补充"} | ${STATUS_LABELS[scenario.status] || scenario.status} | ${CONFIDENCE_LABELS[scenario.confidence] || scenario.confidence} |`;
  });
  const categoryLinks = (data.categories || []).map((category) => `- [${category.title}](场景/${category.file})：${category.purpose}`);
  const componentLinks = components.map((component) => `- [${component.title}](组件/${component.file})：${component.summary}`);
  const sourceLinks = sourceProjects.map((project) => `- **${project.name}**：${project.profile?.purpose || project.profile?.sourceType || "已登记为知识来源"}`);
  files.set("00-知识库导航.md", [
    "# UI 设计知识库导航", "", `> ${disclaimer}`, "",
    "这份知识库以“组件能力 → 场景配方”为可复用主知识。真实页面不再形成平级规范，而作为带来源的页面实例，为场景补充布局经验、适用变体和反例证据。", "",
    section("从场景开始", categoryLinks.join("\n") || "当前尚未从来源项目归纳出任务场景与场景分组。"),
    section("从组件开始", componentLinks.join("\n") || "当前没有完成收录的组件规范。"),
    section("来源项目", sourceLinks.join("\n") || "当前尚未登记来源项目。"),
    section("场景速查", ["| 场景 | 所属层 | 来源项目 | 知识状态 | 可信度 |", "|---|---|---|---|---|", ...navRows].join("\n")),
    section("累计扫描覆盖", [
      `- 来源项目数量：${sourceProjects.length}`,
      `- 页面扫描项总数：${coverage.total}`,
      `- 页面扫描已完成：${coverage.complete}`,
      `- 页面需要运行核对：${coverage.needsRuntime}`,
      `- 页面明确排除：${coverage.excluded}`,
      `- 页面尚未覆盖：${coverage.uncovered}`,
      `- 组件扫描项总数：${componentCoverage.total}`,
      `- 组件扫描已完成：${componentCoverage.complete}`,
      `- 组件需要运行核对：${componentCoverage.needsRuntime}`,
      `- 组件明确排除：${componentCoverage.excluded}`,
      `- 组件尚未覆盖：${componentCoverage.uncovered}`
    ].join("\n")),
    section("其他入口", [
      "- [通用设计规则](01-通用设计规则.md)", "- [页面形态索引](02-页面形态索引.md)",
      "- [来源项目索引](03-来源项目索引.md)", "- [组件使用规范索引](04-组件使用规范索引.md)",
      "- [项目案例索引](05-项目案例索引.md)", "- [待确认事项](99-待确认事项.md)"
    ].join("\n")),
    section("如何理解可信度", [
      "- 正式规范：团队已经明确确认，可约束后续设计。",
      "- 候选规律：从一个或多个项目观察归纳而来，需要继续验证或确认。",
      "- 现状观察：只说明某个来源项目是什么样，不代表以后必须这样设计。",
      "- 限定例外：只在文中写明的条件下覆盖一般规则。",
      "- 多项目重复：提高证据广度，但不会自动升级为正式规范。"
    ].join("\n"))
  ].join("\n").trimEnd() + "\n");

  const rules = (data.generalRules || []).map((rule) => {
    const sources = projectNames(rule.sourceProjectIds, projectById);
    return [
      `## ${rule.title}`, "", rule.rule, "", "**适用：**", "", list(rule.applicableWhen), "",
      "**不适用或例外：**", "", list(rule.avoidWhen), "", `**来源项目：** ${sources.join("、") || "人工确认"}`, "",
      `**知识状态：** ${STATUS_LABELS[rule.status] || rule.status}　 **可信度：** ${CONFIDENCE_LABELS[rule.confidence] || rule.confidence}`, ""
    ].join("\n");
  });
  files.set("01-通用设计规则.md", [
    "# 通用设计规则", "", "> 这里只保留跨多个任务场景成立的规则。项目实现只能贡献证据，不能自动成为通用规范。", "",
    rules.join("\n") || "当前没有经过验证的通用规则。\n"
  ].join("\n").trimEnd() + "\n");

  for (const category of data.categories || []) {
    const body = scenarios.filter((scenario) => scenario.categoryId === category.id).map((scenario) =>
      scenarioMarkdown(scenario, scenarioById, componentById, projectById, instanceById)
    ).join("\n");
    files.set(path.join("场景", category.file), [
      `# ${category.title}`, "", `> ${category.purpose}`, "", body || "当前没有达到收录条件的场景。后续扫描或人工确认后再补充。\n"
    ].join("\n").trimEnd() + "\n");
  }
  for (const component of components) files.set(path.join("组件", component.file), componentMarkdown(component, scenarioById, componentById, projectById));

  const forms = new Map();
  for (const scenario of scenarios) {
    const form = scenario.pagePattern?.form || "待确认";
    const current = forms.get(form) || { summary: scenario.pagePattern?.summary || "", scenarioIds: [], instanceIds: [] };
    current.scenarioIds.push(scenario.id);
    current.instanceIds.push(...(scenario.exampleInstanceIds || []));
    forms.set(form, current);
  }
  const formRows = [...forms.entries()].map(([form, item]) => {
    const titles = [...new Set(item.scenarioIds)].map((id) => scenarioLink(scenarioById.get(id), categoryById)).join("、");
    return `| ${form} | ${item.summary} | ${titles || "暂无"} | ${new Set(item.instanceIds).size} |`;
  });
  files.set("02-页面形态索引.md", [
    "# 页面形态索引", "", "> 页面形态是从场景正文派生的辅助入口，不再维护独立规范。完整布局、状态和选择理由以场景为准。", "",
    "| 页面形态 | 解决的问题 | 关联场景 | 项目实例数 |", "|---|---|---|---|", ...formRows
  ].join("\n").trimEnd() + "\n");

  const sourceSections = sourceProjects.map((project) => {
    const projectInstances = instances.filter((instance) => instance.sourceProjectId === project.id);
    const projectScenarios = scenarios.filter((scenario) => scenario.sourceProjectIds?.includes(project.id));
    const projectComponents = components.filter((component) => component.sourceProjectIds?.includes(project.id));
    const routeCoverage = project.scanState?.coverage || EMPTY_COVERAGE;
    const componentCoverage = project.scanState?.componentCoverage || EMPTY_COVERAGE;
    return [
      `## ${project.name}`, "", project.profile?.purpose || project.profile?.sourceType || "已登记为知识来源。", "",
      `- 来源类型：${SOURCE_KIND_LABELS[project.kind] || "其他来源"}`, `- 贡献场景：${projectScenarios.length}`, `- 贡献组件：${projectComponents.length}`,
      `- 页面实例：${projectInstances.length}`, `- 页面扫描覆盖：${routeCoverage.complete ?? 0}/${routeCoverage.total ?? 0}`,
      `- 组件扫描覆盖：${componentCoverage.complete ?? 0}/${componentCoverage.total ?? 0}`, `- 尚待确认：${project.unknowns?.length || 0}`, ""
    ].join("\n");
  });
  files.set("03-来源项目索引.md", [
    "# 来源项目索引", "", "> 来源项目提供观察证据和页面实例。不同项目中的重复实现不会自动成为正式规范。", "",
    sourceSections.join("\n") || "当前尚未登记来源项目。\n"
  ].join("\n").trimEnd() + "\n");

  const componentRows = components.map((component) => {
    const scenarioTitles = (component.scenarioRoles || []).map((item) => scenarioById.get(item.scenarioId)?.title).filter(Boolean).join("、");
    const sources = projectNames(component.sourceProjectIds, projectById);
    return `| [${component.title}](组件/${component.file}) | ${component.category} | ${component.purpose} | ${scenarioTitles || "暂无"} | ${sources.join("、") || "人工补充"} |`;
  });
  files.set("04-组件使用规范索引.md", [
    "# 组件使用规范索引", "", "> 这里的组件是中文设计能力，不是源码实现名。先根据任务场景选择组件，再安排位置和搭配关系。", "",
    "| 组件 | 类型 | 解决的问题 | 适用场景 | 来源项目 |", "|---|---|---|---|---|", ...componentRows
  ].join("\n").trimEnd() + "\n");

  const instanceRows = instances.map((instance) => {
    const project = projectById.get(instance.sourceProjectId);
    const scenarioTitles = (instance.scenarioIds || []).map((id) => scenarioById.get(id)?.title).filter(Boolean).join("、");
    return `| ${instance.title} | ${project?.name || "未知来源"} | ${instance.businessModule || "未归类"} | ${instance.pageForm || "待确认"} | ${scenarioTitles || "待确认"} | ${STATUS_LABELS[instance.status] || instance.status} |`;
  });
  files.set("05-项目案例索引.md", [
    "# 项目案例索引", "", "> 这里只列出真实页面实例的来源和关联场景，不把实例提升为平级设计规范。详细结构保存在内部事实源，供查询时按需参考。", "",
    "| 页面实例 | 来源项目 | 业务模块 | 页面形态 | 关联场景 | 知识状态 |", "|---|---|---|---|---|---|", ...instanceRows
  ].join("\n").trimEnd() + "\n");

  const pendingSections = (data.pending || []).map((item) => [
    `## ${item.title}`, "", item.question, "", `**为什么需要确认：** ${item.impact}`, "",
    `**建议核对方式：** ${item.nextStep || "由设计或业务负责人确认。"}`, ""
  ].join("\n"));
  files.set("99-待确认事项.md", [
    "# 待确认事项", "", "> 证据不足、跨项目冲突或需要团队做规范选择的内容统一放在这里，不伪装成确定规则。", "",
    pendingSections.join("\n") || "当前没有待确认事项。\n"
  ].join("\n").trimEnd() + "\n");
  return files;
}

function validateCoverage(coverage, label, fail) {
  if (!coverage) {
    fail(`缺少 ${label}`);
    return;
  }
  const keys = Object.keys(EMPTY_COVERAGE);
  if (keys.some((key) => !Number.isInteger(coverage[key]) || coverage[key] < 0)) {
    fail(`${label} 必须全部为非负整数`);
  } else if (coverage.total !== coverage.complete + coverage.needsRuntime + coverage.excluded + coverage.uncovered) {
    fail(`${label} 分项之和必须等于 total`);
  }
}

function evidenceSet(input) {
  if (input instanceof Set) return input;
  if (Array.isArray(input)) return new Set(input.map((item) => typeof item === "string" ? item : item.id).filter(Boolean));
  return new Set();
}

export function validateKnowledgeData(data, evidenceInput = new Set()) {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);
  const evidenceIds = evidenceSet(evidenceInput);

  if (data.schemaVersion !== SCHEMA_VERSION) fail(`schemaVersion 必须为 ${SCHEMA_VERSION}`);
  if (!Number.isInteger(data.revision) || data.revision < 1) fail("revision 必须为正整数");
  if (!data.library || typeof data.library !== "object") fail("缺少 library");
  if (!data.library?.name || data.library?.mode !== "multi-project") fail("library 缺少名称或不是 multi-project 模式");
  for (const key of ["sourceProjects", "categories", "generalRules", "components", "scenarios", "pageInstances", "pending"]) {
    if (!Array.isArray(data[key])) fail(`${key} 必须为数组`);
  }
  for (const removedKey of ["project", "scanState", "pageArchetypes", "pages", "modules"]) {
    if (removedKey in data) fail(`schema 2.0 不再支持顶层 ${removedKey}；请先迁移`);
  }

  const sourceProjects = data.sourceProjects || [];
  const sourceProjectIds = new Set(sourceProjects.map((item) => item.id));
  const sourceStableKeys = [];
  if (sourceProjectIds.size !== sourceProjects.length) fail("来源项目 ID 重复");
  for (const project of sourceProjects) {
    const label = project.id || "未知来源项目";
    if (!project.id || !project.name || !project.kind) fail(`${label} 缺少 ID、名称或来源类型`);
    if (!project.identity?.stableKey || !Array.isArray(project.identity?.aliases)) fail(`${label} 缺少稳定身份键或别名数组`);
    if (project.identity?.stableKey) sourceStableKeys.push(project.identity.stableKey);
    if (!project.profile || typeof project.profile !== "object") fail(`${label} 缺少项目画像`);
    if (!Array.isArray(project.unknowns)) fail(`${label} 的 unknowns 必须为数组`);
    if (!project.scanState || !Array.isArray(project.scanState.routeLedger) || !Array.isArray(project.scanState.componentLedger)) fail(`${label} 缺少扫描账本`);
    validateCoverage(project.scanState?.coverage, `${label}.scanState.coverage`, fail);
    validateCoverage(project.scanState?.componentCoverage, `${label}.scanState.componentCoverage`, fail);
  }
  if (new Set(sourceStableKeys).size !== sourceStableKeys.length) fail("来源项目 stableKey 重复");

  const categoryTitles = (data.categories || []).map((item) => item.title);
  const categoryIdsList = (data.categories || []).map((item) => item.id);
  const categoryFiles = (data.categories || []).map((item) => item.file);
  for (const category of data.categories || []) {
    if (!category.id || !category.title || !category.file || !category.purpose) fail("存在缺少 ID、标题、文件或目的的场景分组");
    if (!(data.scenarios || []).some((scenario) => scenario.categoryId === category.id)) fail(`场景分组 ${category.title || category.id} 没有任何真实场景`);
  }
  if (new Set(categoryTitles).size !== categoryTitles.length) fail("场景分类标题重复");
  if (new Set(categoryIdsList).size !== categoryIdsList.length) fail("场景分类 ID 重复");
  if (new Set(categoryFiles).size !== categoryFiles.length) fail("场景分类文件名重复");

  const allObjects = [
    ...(data.sourceProjects || []), ...(data.categories || []),
    ...(data.generalRules || []), ...(data.components || []), ...(data.scenarios || []),
    ...(data.pageInstances || []), ...(data.pending || []),
    ...(data.scenarios || []).flatMap((item) => item.variants || [])
  ];
  const ids = allObjects.map((item) => item.id).filter(Boolean);
  if (ids.length !== allObjects.length) fail("存在缺少稳定 ID 的知识对象");
  if (new Set(ids).size !== ids.length) fail("稳定 ID 重复");

  const categoryIds = new Set((data.categories || []).map((item) => item.id));
  const scenarioIds = new Set((data.scenarios || []).map((item) => item.id));
  const componentIds = new Set((data.components || []).map((item) => item.id));
  const instanceIds = new Set((data.pageInstances || []).map((item) => item.id));
  const componentById = new Map((data.components || []).map((item) => [item.id, item]));
  const scenarioById = new Map((data.scenarios || []).map((item) => [item.id, item]));
  const instanceById = new Map((data.pageInstances || []).map((item) => [item.id, item]));
  const allowedStatuses = new Set(Object.keys(STATUS_LABELS));
  const allowedConfidence = new Set(Object.keys(CONFIDENCE_LABELS));
  const semanticKeys = [];

  function validateProjectRefs(ids, label) {
    if (!Array.isArray(ids)) return fail(`${label} 的 sourceProjectIds 必须为数组`);
    for (const projectId of ids) if (!sourceProjectIds.has(projectId)) fail(`${label} 引用了不存在的来源项目 ${projectId}`);
  }
  function validateEvidenceRefs(ids, label) {
    if (!Array.isArray(ids)) return fail(`${label} 的 evidenceRefs 必须为数组`);
    for (const evidenceId of ids) if (!evidenceIds.has(evidenceId)) fail(`${label} 引用了不存在的证据 ${evidenceId}`);
  }

  for (const rule of data.generalRules || []) {
    const label = rule.id || "未知通用规则";
    if (!rule.title || !rule.rule || !Array.isArray(rule.applicableWhen) || !Array.isArray(rule.avoidWhen)) fail(`${label} 的通用规则结构不完整`);
    if (!allowedStatuses.has(rule.status)) fail(`${label} 的 status 不受支持`);
    if (!allowedConfidence.has(rule.confidence)) fail(`${label} 的 confidence 不受支持`);
    validateProjectRefs(rule.sourceProjectIds, label);
    validateEvidenceRefs(rule.evidenceRefs, label);
  }

  for (const scenario of data.scenarios || []) {
    const label = scenario.id || "未知场景";
    if (!categoryIds.has(scenario.categoryId)) fail(`${label} 引用了不存在的场景分类`);
    if (!scenario.title || !scenario.summary || !scenario.userGoal || !scenario.semanticKey) fail(`${label} 缺少标题、摘要、用户目标或语义键`);
    semanticKeys.push(scenario.semanticKey);
    for (const key of ["userGoal", "objectScope", "taskStage", "duration", "risk", "result"]) {
      if (!scenario.semanticProfile?.[key]) fail(`${label} 的 semanticProfile 缺少 ${key}`);
    }
    if (!Array.isArray(scenario.applicableWhen) || scenario.applicableWhen.length === 0) fail(`${label} 缺少适用条件`);
    if (!Array.isArray(scenario.avoidWhen) || scenario.avoidWhen.length === 0) fail(`${label} 缺少不适用条件`);
    const pattern = scenario.pagePattern;
    if (!pattern?.form || !pattern?.summary || !Array.isArray(pattern?.orderedRegions) || pattern.orderedRegions.length === 0) fail(`${label} 缺少场景内页面形态或区域顺序`);
    for (const key of ["direction", "primary", "secondary"]) if (!pattern?.layout?.[key]) fail(`${label} 的布局骨架缺少 ${key}`);
    if (!Array.isArray(pattern?.layout?.relationships) || pattern.layout.relationships.length === 0) fail(`${label} 缺少布局关系`);
    for (const region of pattern?.orderedRegions || []) if (!region.name || !region.purpose) fail(`${label} 的场景区域缺少名称或目的`);
    if (!Array.isArray(scenario.composition) || scenario.composition.length === 0) fail(`${label} 缺少功能组合`);
    if (!Array.isArray(scenario.componentRecipe?.required) || scenario.componentRecipe.required.length === 0) fail(`${label} 缺少必需组件配方`);
    if (!Array.isArray(scenario.componentRecipe?.conditional) || !Array.isArray(scenario.componentRecipe?.avoid)) fail(`${label} 的条件组件或避免组件配方不完整`);
    if (!Array.isArray(scenario.interactionFlow) || scenario.interactionFlow.length === 0) fail(`${label} 缺少任务顺序`);
    if (!Array.isArray(scenario.states) || scenario.states.length === 0) fail(`${label} 缺少关键状态`);
    if (!Array.isArray(scenario.variants) || !Array.isArray(scenario.exampleInstanceIds)) fail(`${label} 缺少变体或页面实例引用数组`);
    if (!allowedStatuses.has(scenario.status)) fail(`${label} 的 status 不受支持`);
    if (!allowedConfidence.has(scenario.confidence)) fail(`${label} 的 confidence 不受支持`);
    validateProjectRefs(scenario.sourceProjectIds, label);
    validateEvidenceRefs(scenario.evidenceRefs, label);
    for (const relationId of [...(scenario.relations?.mayLeadTo || []), ...(scenario.relations?.related || [])]) {
      if (!scenarioIds.has(relationId)) fail(`${label} 引用了不存在的关联场景 ${relationId}`);
    }
    for (const item of [
      ...(scenario.componentRecipe?.required || []), ...(scenario.componentRecipe?.conditional || []), ...(scenario.componentRecipe?.avoid || [])
    ]) {
      if (!componentIds.has(item.componentId)) fail(`${label} 引用了不存在的设计组件 ${item.componentId}`);
      if (!item.role || !item.placement || !item.reason) fail(`${label} 的组件配方 ${item.componentId || "未知组件"} 缺少角色、位置或理由`);
      if ((scenario.componentRecipe?.conditional || []).includes(item) && !item.when) fail(`${label} 的条件组件 ${item.componentId} 缺少出现条件`);
      const component = componentById.get(item.componentId);
      const isAvoided = (scenario.componentRecipe?.avoid || []).includes(item);
      if (!isAvoided && component && !(component.scenarioRoles || []).some((role) => role.scenarioId === scenario.id)) {
        fail(`${label} 的组件配方 ${item.componentId} 没有在组件规范中声明对应场景角色`);
      }
    }
    for (const variant of scenario.variants || []) {
      if (!variant.title || !Array.isArray(variant.conditions) || variant.conditions.length === 0 || !Array.isArray(variant.differences) || variant.differences.length === 0) fail(`${label} 的变体 ${variant.id || "未知"} 结构不完整`);
      validateProjectRefs(variant.sourceProjectIds, `${label} 的变体 ${variant.id}`);
      validateEvidenceRefs(variant.evidenceRefs, `${label} 的变体 ${variant.id}`);
    }
    for (const instanceId of scenario.exampleInstanceIds || []) {
      const instance = instanceById.get(instanceId);
      if (!instance) fail(`${label} 引用了不存在的页面实例 ${instanceId}`);
      else if (!(instance.scenarioIds || []).includes(scenario.id)) fail(`${label} 与页面实例 ${instanceId} 的引用不是双向的`);
    }
  }
  if (new Set(semanticKeys).size !== semanticKeys.length) fail("场景 semanticKey 重复；应归并证据或声明变体，而不是创建同义场景");

  const componentFiles = [];
  for (const component of data.components || []) {
    const label = component.id || "未知组件";
    if (!component.title || !component.file || !component.category || !component.summary || !component.purpose) fail(`${label} 缺少标题、文件、类型、摘要或目的`);
    if (!Array.isArray(component.applicableWhen) || component.applicableWhen.length === 0) fail(`${label} 缺少适用场景`);
    if (!Array.isArray(component.avoidWhen) || component.avoidWhen.length === 0) fail(`${label} 缺少不适用场景`);
    for (const key of ["contentRules", "layoutRules", "interactionRules", "states", "scenarioRoles", "compositionRules"]) {
      if (!Array.isArray(component[key]) || component[key].length === 0) fail(`${label} 缺少 ${key}`);
    }
    if (!allowedStatuses.has(component.status)) fail(`${label} 的 status 不受支持`);
    if (!allowedConfidence.has(component.confidence)) fail(`${label} 的 confidence 不受支持`);
    validateProjectRefs(component.sourceProjectIds, label);
    validateEvidenceRefs(component.evidenceRefs, label);
    for (const role of component.scenarioRoles || []) {
      if (!scenarioIds.has(role.scenarioId)) fail(`${label} 引用了不存在的场景 ${role.scenarioId}`);
      if (!role.role || !role.when) fail(`${label} 的场景角色缺少角色或出现条件`);
      const scenario = scenarioById.get(role.scenarioId);
      const recipeItems = scenario ? [...(scenario.componentRecipe?.required || []), ...(scenario.componentRecipe?.conditional || [])] : [];
      if (scenario && !recipeItems.some((item) => item.componentId === component.id)) fail(`${label} 声明了场景 ${role.scenarioId}，但该场景配方没有引用此组件`);
    }
    for (const rule of component.compositionRules || []) {
      if (!componentIds.has(rule.withComponentId)) fail(`${label} 引用了不存在的组合组件 ${rule.withComponentId}`);
      if (!rule.relationship || !rule.when) fail(`${label} 的组件组合规则缺少关系或条件`);
    }
    componentFiles.push(component.file);
  }
  if (new Set(componentFiles).size !== componentFiles.length) fail("设计组件文件名重复");

  function validateRegion(region, instanceLabel, regionIds) {
    if (!region.id || regionIds.has(region.id)) fail(`${instanceLabel} 存在缺少或重复 ID 的页面区域`);
    if (region.id) regionIds.add(region.id);
    for (const key of ["name", "placement", "purpose", "priority", "sizing", "layout", "relationship"]) {
      if (!region[key]) fail(`${instanceLabel} 的区域 ${region.id || "未知区域"} 缺少 ${key}`);
    }
    if (!Array.isArray(region.components) || region.components.length === 0) fail(`${instanceLabel} 的区域 ${region.id || "未知区域"} 缺少组件实例`);
    for (const instance of region.components || []) {
      if (!componentIds.has(instance.componentId)) fail(`${instanceLabel} 的区域 ${region.id} 引用了不存在的设计组件 ${instance.componentId}`);
      for (const key of ["role", "placement", "sizing", "content", "behavior", "visibleWhen"]) if (!instance[key]) fail(`${instanceLabel} 的组件实例 ${instance.componentId || "未知组件"} 缺少 ${key}`);
      if (!Array.isArray(instance.states) || instance.states.length === 0) fail(`${instanceLabel} 的组件实例 ${instance.componentId || "未知组件"} 缺少局部状态`);
    }
    if (region.children !== undefined && !Array.isArray(region.children)) fail(`${instanceLabel} 的区域 ${region.id} children 必须为数组`);
    for (const child of region.children || []) validateRegion(child, instanceLabel, regionIds);
  }

  const coverageValues = new Set(["complete", "partial", "unknown", "not-applicable"]);
  for (const instance of data.pageInstances || []) {
    const label = instance.id || "未知页面实例";
    if (!instance.title || !instance.summary || !instance.userGoal || !instance.entry || !instance.pageForm || !instance.businessModule) fail(`${label} 缺少标题、摘要、目标、入口、页面形态或业务模块`);
    if (!sourceProjectIds.has(instance.sourceProjectId)) fail(`${label} 引用了不存在的来源项目 ${instance.sourceProjectId}`);
    if (!Array.isArray(instance.scenarioIds) || instance.scenarioIds.length === 0) fail(`${label} 缺少关联场景`);
    for (const scenarioId of instance.scenarioIds || []) {
      if (!scenarioIds.has(scenarioId)) fail(`${label} 引用了不存在的场景 ${scenarioId}`);
      else if (!(scenarioById.get(scenarioId)?.exampleInstanceIds || []).includes(instance.id)) fail(`${label} 与场景 ${scenarioId} 的引用不是双向的`);
    }
    const structure = instance.pageStructure;
    if (!structure?.overview) fail(`${label} 缺少页面全景摘要`);
    for (const key of ["applicationFrame", "navigation", "contentCanvas", "scrolling", "overlays"]) if (!structure?.shell?.[key]) fail(`${label} 的页面外壳缺少 ${key}`);
    for (const key of ["summary", "direction", "primary", "secondary"]) if (!structure?.layout?.[key]) fail(`${label} 的布局骨架缺少 ${key}`);
    if (!Array.isArray(structure?.layout?.relationships) || structure.layout.relationships.length === 0) fail(`${label} 缺少区域关系`);
    if (!Array.isArray(structure?.regions) || structure.regions.length === 0) fail(`${label} 缺少页面区域树`);
    const regionIds = new Set();
    for (const region of structure?.regions || []) validateRegion(region, label, regionIds);
    const instanceComponentIds = [];
    const collectComponents = (regions) => {
      for (const region of regions || []) {
        instanceComponentIds.push(...(region.components || []).map((item) => item.componentId));
        collectComponents(region.children);
      }
    };
    collectComponents(structure?.regions);
    for (const componentId of instanceComponentIds) {
      const component = componentById.get(componentId);
      if (component && !(component.scenarioRoles || []).some((role) => instance.scenarioIds.includes(role.scenarioId))) fail(`${label} 使用的组件 ${componentId} 没有与页面实例关联场景对应的角色`);
    }
    if (!Array.isArray(instance.interactionFlow) || instance.interactionFlow.length === 0) fail(`${label} 缺少页面任务流程`);
    if (!Array.isArray(instance.states) || instance.states.length === 0) fail(`${label} 缺少页面关键状态`);
    for (const state of instance.states || []) if (!state.name || !state.trigger || !state.recovery || !Array.isArray(state.changes) || state.changes.length === 0) fail(`${label} 的页面状态不完整`);
    if (!Array.isArray(instance.responsiveRules) || instance.responsiveRules.length === 0) fail(`${label} 缺少空间适配规则`);
    if (!Array.isArray(instance.designBoundaries) || instance.designBoundaries.length === 0) fail(`${label} 缺少设计边界`);
    for (const key of ["shell", "layout", "components", "states", "responsive"]) if (!coverageValues.has(instance.coverage?.[key])) fail(`${label} 的 ${key} 覆盖状态不受支持`);
    if (!allowedStatuses.has(instance.status)) fail(`${label} 的 status 不受支持`);
    if (!allowedConfidence.has(instance.confidence)) fail(`${label} 的 confidence 不受支持`);
    validateEvidenceRefs(instance.evidenceRefs, label);
  }

  for (const item of data.pending || []) {
    const label = item.id || "未知待确认项";
    if (!item.title || !item.question || !item.impact || !item.nextStep) fail(`${label} 的待确认项结构不完整`);
    for (const scenarioId of item.relatedScenarioIds || []) if (!scenarioIds.has(scenarioId)) fail(`${label} 引用了不存在的场景 ${scenarioId}`);
    for (const instanceId of item.relatedInstanceIds || []) if (!instanceIds.has(instanceId)) fail(`${label} 引用了不存在的页面实例 ${instanceId}`);
  }

  if (sourceProjects.length === 0) warn("知识库尚未登记来源项目");
  if (!(data.scenarios || []).length) warn("知识库尚未收录场景");
  if (!(data.components || []).length) warn("知识库尚未收录组件规范");
  if (!(data.pageInstances || []).length) warn("知识库尚未收录项目页面实例");
  const unknowns = sourceProjects.reduce((sum, project) => sum + (project.unknowns?.length || 0), 0);
  if (unknowns > 0) warn(`来源项目仍有 ${unknowns} 个画像未知项`);
  if ((data.pending || []).length > 0) warn(`仍有 ${data.pending.length} 个待确认事项`);
  return { errors, warnings };
}

export function validateVisibleFiles(root, data) {
  const errors = [];
  const warnings = [];
  const visibleRoot = path.join(root, VISIBLE_DIR);
  const expected = [...renderKnowledge(data).keys()];
  if (!fs.existsSync(visibleRoot)) return { errors: [`缺少 ${VISIBLE_DIR}`], warnings };
  for (const relativePath of expected) {
    if (!fs.existsSync(path.join(visibleRoot, relativePath))) errors.push(`缺少可见文档：${path.join(VISIBLE_DIR, relativePath)}`);
  }
  if (fs.existsSync(path.join(visibleRoot, "页面"))) errors.push("可见知识库不应再包含独立 页面/ 目录；真实页面应保存在 pageInstances");
  const forbidden = [
    { pattern: /\b(?:React|Vue|Angular|TypeScript|JavaScript|props?|component|router|store)\b/gi, label: "框架或工程术语" },
    { pattern: /(?:^|[\s(])(?:src|app|pages|components)\/[\w./-]+/gim, label: "源码路径" },
    { pattern: /\.(?:tsx?|jsx?|vue|svelte|css|scss|less)\b/gi, label: "源码文件扩展名" },
    { pattern: /\b[a-z]{1,8}-[a-z][a-z0-9-]{2,}\b/g, label: "疑似工程组件名" }
  ];
  for (const relativePath of expected) {
    const filePath = path.join(visibleRoot, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(content)) errors.push(`${path.join(VISIBLE_DIR, relativePath)} 含${rule.label}`);
    }
  }
  return { errors, warnings };
}

export function writeRenderedViews(root, data) {
  const visibleRoot = path.join(root, VISIBLE_DIR);
  const knowledgeRoot = path.join(root, KNOWLEDGE_DIR);
  const suffix = `${process.pid}-${Date.now()}`;
  const stagingRoot = path.join(knowledgeRoot, `.UI设计知识库.staging-${suffix}`);
  const backupRoot = path.join(knowledgeRoot, `.UI设计知识库.backup-${suffix}`);
  fs.mkdirSync(stagingRoot, { recursive: true });
  try {
    for (const [relativePath, content] of renderKnowledge(data)) {
      const filePath = path.join(stagingRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
    }
    if (fs.existsSync(visibleRoot)) fs.renameSync(visibleRoot, backupRoot);
    fs.renameSync(stagingRoot, visibleRoot);
    if (fs.existsSync(backupRoot)) fs.rmSync(backupRoot, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(visibleRoot) && fs.existsSync(backupRoot)) fs.renameSync(backupRoot, visibleRoot);
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export function validateEvidenceData(data, evidence) {
  const errors = [];
  const warnings = [];
  const evidenceIds = (evidence || []).map((item) => item.id).filter(Boolean);
  if (new Set(evidenceIds).size !== evidenceIds.length) errors.push("证据 ID 重复");
  const sourceProjectIds = new Set((data.sourceProjects || []).map((item) => item.id));
  const supportedIds = new Set([
    ...(data.generalRules || []).map((item) => item.id), ...(data.components || []).map((item) => item.id),
    ...(data.scenarios || []).map((item) => item.id), ...(data.pageInstances || []).map((item) => item.id),
    ...(data.pending || []).map((item) => item.id),
    ...(data.scenarios || []).flatMap((item) => (item.variants || []).map((variant) => variant.id))
  ]);
  for (const item of evidence || []) {
    const label = item.id || "未知证据";
    if (!item.id || !item.kind || !item.summary || !item.capturedAt) errors.push(`${label} 的证据结构不完整`);
    if (!sourceProjectIds.has(item.sourceProjectId)) errors.push(`${label} 引用了不存在的来源项目 ${item.sourceProjectId}`);
    if (!Array.isArray(item.supports) || item.supports.length === 0) errors.push(`${label} 缺少 supports`);
    for (const id of item.supports || []) if (!supportedIds.has(id)) errors.push(`${label} 支持了不存在的知识对象 ${id}`);
  }
  return { errors, warnings };
}

export function validateRoot(root) {
  const internalRoot = path.join(root, INTERNAL_DIR);
  const knowledgePath = path.join(internalRoot, "knowledge.json");
  const evidencePath = path.join(internalRoot, "evidence.jsonl");
  if (!fs.existsSync(knowledgePath)) return { errors: [`缺少 ${path.join(INTERNAL_DIR, "knowledge.json")}`], warnings: [] };
  let data;
  let evidence;
  try {
    data = readJson(knowledgePath);
    evidence = readJsonl(evidencePath);
  } catch (error) {
    return { errors: [error.message], warnings: [] };
  }
  const structure = validateKnowledgeData(data, evidence);
  const evidenceValidation = validateEvidenceData(data, evidence);
  const visible = validateVisibleFiles(root, data);
  return {
    errors: [...structure.errors, ...evidenceValidation.errors, ...visible.errors],
    warnings: [...structure.warnings, ...evidenceValidation.warnings, ...visible.warnings],
    data
  };
}
