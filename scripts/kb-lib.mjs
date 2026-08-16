import fs from "node:fs";
import path from "node:path";

export const SCHEMA_VERSION = "1.1.0";
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

const CONFIDENCE_LABELS = {
  low: "低",
  medium: "中",
  high: "高"
};

const COVERAGE_LABELS = {
  complete: "已覆盖",
  partial: "部分覆盖",
  unknown: "未确认",
  "not-applicable": "不适用"
};

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
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
  if (!Array.isArray(items) || items.length === 0) return emptyText;
  return items.map((item) => `- ${item}`).join("\n");
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}

function relationTitles(ids, scenarioById) {
  return (ids || []).map((id) => scenarioById.get(id)?.title).filter(Boolean);
}

function knowledgeState(item) {
  return `**知识状态：** ${STATUS_LABELS[item.status] || item.status}　 **可信度：** ${CONFIDENCE_LABELS[item.confidence] || item.confidence}`;
}

function componentLink(component, label = component?.title) {
  if (!component) return label || "未识别组件";
  return component.file ? `[${label || component.title}](../组件/${component.file})` : (label || component.title);
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

function scenarioMarkdown(scenario, scenarioById, archetypeById, componentById) {
  const regions = (scenario.pageShape?.orderedRegions || []).map((region, index) =>
    `${index + 1}. ${region.name}：${region.purpose}`
  );
  const composition = (scenario.composition || []).map((item) => {
    const suffix = item.when ? ` 出现条件：${item.when}` : "";
    return `**${item.name}**：${item.purpose}${suffix}`;
  });
  const states = (scenario.states || []).map((state) => `**${state.name}**：${state.expectation}`);
  const leads = relationTitles(scenario.relations?.mayLeadTo, scenarioById);
  const related = relationTitles(scenario.relations?.related, scenarioById);
  const archetype = archetypeById.get(scenario.pageArchetypeId);
  const recipe = scenario.componentRecipe || {};
  const recipeLines = [
    ...recipeItems(recipe.required, componentById, "必需"),
    ...recipeItems(recipe.conditional, componentById, "条件出现"),
    ...recipeItems(recipe.avoid, componentById, "避免")
  ];
  const relationLines = [];
  if (leads.length) relationLines.push(`- 后续可能进入：${leads.join("、")}`);
  if (related.length) relationLines.push(`- 常与以下场景组合：${related.join("、")}`);

  return [
    `## ${scenario.title}`,
    "",
    `> ${scenario.summary}`,
    "",
    knowledgeState(scenario),
    "",
    "### 用户任务",
    "",
    scenario.userGoal,
    "",
    "### 适用场景",
    "",
    list(scenario.applicableWhen),
    "",
    "### 不适用场景",
    "",
    list(scenario.avoidWhen),
    "",
    "### 页面整体形态",
    "",
    archetype ? `**${archetype.title}。** ${scenario.pageShape.summary}` : scenario.pageShape.summary,
    "",
    "页面从进入到主要内容的空间顺序：",
    "",
    regions.join("\n") || "暂无。",
    "",
    "### 功能组合",
    "",
    list(composition),
    "",
    "### 组件搭配配方",
    "",
    recipeLines.join("\n") || "暂无。",
    "",
    "### 完成任务的顺序",
    "",
    (scenario.interactionFlow || []).map((step, index) => `${index + 1}. ${step}`).join("\n") || "暂无。",
    "",
    "### 关键状态",
    "",
    list(states),
    "",
    "### 场景关系",
    "",
    relationLines.join("\n") || "暂无直接关系。",
    "",
    "### 设计边界",
    "",
    list(scenario.designBoundaries),
    ""
  ].join("\n");
}

function componentMarkdown(component, scenarioById, componentById) {
  const scenarioLines = (component.scenarioRoles || []).map((item) => {
    const scenario = scenarioById.get(item.scenarioId);
    const title = scenario?.title || item.scenarioId;
    return `- **${title}**：${item.role}${item.when ? `；出现条件：${item.when}` : ""}`;
  });
  const compositionLines = (component.compositionRules || []).map((item) => {
    const peer = componentById.get(item.withComponentId);
    return `- 与 **${componentLink(peer)}** ${item.relationship}${item.when ? `；条件：${item.when}` : ""}`;
  });
  const states = (component.states || []).map((state) => `- **${state.name}**：${state.expectation}`);
  return [
    `# ${component.title}`,
    "",
    `> ${component.summary}`,
    "",
    knowledgeState(component),
    "",
    section("解决的问题", component.purpose),
    section("适用场景", list(component.applicableWhen)),
    section("不适用场景", list(component.avoidWhen)),
    section("在任务场景中的角色", scenarioLines.join("\n") || "暂无。"),
    section("与其他组件的组合关系", compositionLines.join("\n") || "暂无。"),
    section("内容规则", list(component.contentRules)),
    section("布局规则", list(component.layoutRules)),
    section("交互规则", list(component.interactionRules)),
    section("组件状态", states.join("\n") || "暂无。")
  ].join("\n").trimEnd() + "\n";
}

function componentInstanceLines(instances, componentById, headingLevel = 4) {
  return (instances || []).flatMap((instance, index) => {
    const component = componentById.get(instance.componentId);
    const lines = [
      `${"#".repeat(Math.min(headingLevel, 6))} ${index + 1}. ${componentLink(component, instance.name || component?.title)}`,
      "",
      `- 业务角色：${instance.role}`,
      `- 位置：${instance.placement}`,
      `- 空间方式：${instance.sizing}`,
      `- 内容：${instance.content}`,
      `- 交互：${instance.behavior}`,
      `- 出现条件：${instance.visibleWhen}`
    ];
    if (instance.states?.length) lines.push(`- 局部状态：${instance.states.join("；")}`);
    lines.push("");
    return lines;
  });
}

function regionMarkdown(region, componentById, depth = 0, index = 0) {
  const headingLevel = Math.min(3 + depth, 5);
  const heading = "#".repeat(headingLevel);
  const children = (region.children || []).map((child, childIndex) => regionMarkdown(child, componentById, depth + 1, childIndex)).join("\n");
  return [
    `${heading} ${index + 1}. ${region.name}`,
    "",
    `- 位置：${region.placement}`,
    `- 目的：${region.purpose}`,
    `- 优先级：${region.priority}`,
    `- 空间占用：${region.sizing}`,
    `- 内部布局：${region.layout}`,
    `- 相邻关系：${region.relationship}`,
    "",
    ...componentInstanceLines(region.components, componentById, headingLevel + 1),
    children
  ].join("\n").trimEnd();
}

function pageMarkdown(page, scenarioById, archetypeById, componentById) {
  const structure = page.pageStructure;
  const shell = structure.shell;
  const layout = structure.layout;
  const archetype = archetypeById.get(page.pageArchetypeId);
  const scenarios = (page.scenarioIds || []).map((id) => scenarioById.get(id)?.title).filter(Boolean);
  const relationships = (layout.relationships || []).map((item) => `- ${item}`);
  const regions = (structure.regions || []).map((region, index) => regionMarkdown(region, componentById, 0, index)).join("\n\n");
  const flow = (page.interactionFlow || []).map((step, index) => `${index + 1}. ${step}`);
  const states = (page.states || []).map((state) => {
    const changes = (state.changes || []).map((change) => `- ${change.region}：${change.change}`).join("\n");
    return [`### ${state.name}`, "", `触发：${state.trigger}`, "", changes || "- 未确认区域变化。", "", `恢复或下一步：${state.recovery}`].join("\n");
  });
  const coverage = page.coverage || {};
  return [
    `# ${page.title}`,
    "",
    `> ${page.summary}`,
    "",
    knowledgeState(page),
    "",
    section("页面定位", [
      `- 用户目标：${page.userGoal}`,
      `- 进入方式：${page.entry}`,
      `- 页面形态：${archetype?.title || "待确认"}`,
      `- 关联场景：${scenarios.join("、") || "待确认"}`
    ].join("\n")),
    section("页面全景", [
      structure.overview,
      "",
      `- 应用外壳：${shell.applicationFrame}`,
      `- 导航关系：${shell.navigation}`,
      `- 内容画布：${shell.contentCanvas}`,
      `- 滚动策略：${shell.scrolling}`,
      `- 覆盖层策略：${shell.overlays}`
    ].join("\n")),
    section("布局骨架", [
      layout.summary,
      "",
      `- 主布局方向：${layout.direction}`,
      `- 主区域：${layout.primary}`,
      `- 次要区域：${layout.secondary}`,
      ...relationships
    ].join("\n")),
    section("区域与组件搭配", regions || "暂无。"),
    section("任务流程", flow.join("\n") || "暂无。"),
    section("关键状态", states.join("\n\n") || "暂无。"),
    section("空间适配", list(page.responsiveRules)),
    section("设计边界", list(page.designBoundaries)),
    section("信息覆盖", [
      `- 页面外壳：${COVERAGE_LABELS[coverage.shell] || "未确认"}`,
      `- 布局关系：${COVERAGE_LABELS[coverage.layout] || "未确认"}`,
      `- 组件明细：${COVERAGE_LABELS[coverage.components] || "未确认"}`,
      `- 状态变化：${COVERAGE_LABELS[coverage.states] || "未确认"}`,
      `- 空间适配：${COVERAGE_LABELS[coverage.responsive] || "未确认"}`
    ].join("\n"))
  ].join("\n").trimEnd() + "\n";
}

export function renderKnowledge(data) {
  const files = new Map();
  const scenarios = data.scenarios || [];
  const pages = data.pages || [];
  const components = data.components || [];
  const scenarioById = new Map(scenarios.map((item) => [item.id, item]));
  const pageById = new Map(pages.map((item) => [item.id, item]));
  const componentById = new Map(components.map((item) => [item.id, item]));
  const archetypeById = new Map((data.pageArchetypes || []).map((item) => [item.id, item]));
  const categoryById = new Map((data.categories || []).map((item) => [item.id, item]));
  const coverage = data.scanState?.coverage || {};
  const disclaimer = data.project?.disclaimer || "候选内容不等于已确认设计规范。";

  const navRows = scenarios.map((scenario) => {
    const category = categoryById.get(scenario.categoryId);
    const target = category ? `场景/${category.file}#${scenario.title}` : "";
    const title = target ? `[${scenario.title}](${target})` : scenario.title;
    return `| ${title} | ${category?.title || "未分类"} | ${STATUS_LABELS[scenario.status] || scenario.status} | ${CONFIDENCE_LABELS[scenario.confidence] || scenario.confidence} |`;
  });
  const categoryLinks = (data.categories || []).map((category) =>
    `- [${category.title}](场景/${category.file})：${category.purpose}`
  );
  const pageLinks = pages.map((page) => `- [${page.title}](页面/${page.file})：${page.summary}`);
  const componentLinks = components.map((component) => `- [${component.title}](组件/${component.file})：${component.summary}`);
  const componentCoverage = data.scanState?.componentCoverage || {};
  const nav = [
    "# UI 设计知识库导航",
    "",
    `> ${disclaimer}`,
    "",
    "这份知识库使用“组件能力 → 场景配方 → 页面蓝图”三层结构。页面蓝图从整体到局部还原真实页面，场景解释为什么这样组合，组件规范说明每种设计组件何时使用。",
    "",
    section("从真实页面开始", pageLinks.join("\n") || "当前没有完成收录的页面蓝图。"),
    section("从场景开始", categoryLinks.join("\n") || "当前尚未从源码归纳出任务场景与场景分组。"),
    section("从组件开始", componentLinks.join("\n") || "当前没有完成收录的组件规范。"),
    section("场景速查", [
      "| 场景 | 所属层 | 知识状态 | 可信度 |",
      "|---|---|---|---|",
      ...navRows
    ].join("\n")),
    section("扫描覆盖", [
      `- 扫描项总数：${coverage.total ?? 0}`,
      `- 已完成：${coverage.complete ?? 0}`,
      `- 需要运行页面核对：${coverage.needsRuntime ?? 0}`,
      `- 明确排除：${coverage.excluded ?? 0}`,
      `- 尚未覆盖：${coverage.uncovered ?? 0}`,
      `- 组件扫描项总数：${componentCoverage.total ?? 0}`,
      `- 组件已完成：${componentCoverage.complete ?? 0}`,
      `- 组件需要运行核对：${componentCoverage.needsRuntime ?? 0}`,
      `- 组件明确排除：${componentCoverage.excluded ?? 0}`,
      `- 组件尚未覆盖：${componentCoverage.uncovered ?? 0}`
    ].join("\n")),
    section("其他入口", [
      "- [通用设计规则](01-通用设计规则.md)",
      "- [页面形态索引](02-页面形态索引.md)",
      "- [业务模块索引](03-业务模块索引.md)",
      "- [组件使用规范索引](04-组件使用规范索引.md)",
      "- [待确认事项](99-待确认事项.md)"
    ].join("\n")),
    section("如何理解可信度", [
      "- 正式规范：团队已经明确确认，可约束后续设计。",
      "- 候选规律：从既有页面归纳而来，需要继续验证或确认。",
      "- 现状观察：只说明当前页面是什么样，不代表以后必须这样设计。",
      "- 限定例外：只在文中写明的条件下覆盖一般规则。"
    ].join("\n"))
  ].join("\n");
  files.set("00-知识库导航.md", nav.trimEnd() + "\n");

  const rules = (data.generalRules || []).map((rule) => [
    `## ${rule.title}`,
    "",
    rule.rule,
    "",
    "**适用：**",
    "",
    list(rule.applicableWhen),
    "",
    "**不适用或例外：**",
    "",
    list(rule.avoidWhen),
    "",
    `**知识状态：** ${STATUS_LABELS[rule.status] || rule.status}　 **可信度：** ${CONFIDENCE_LABELS[rule.confidence] || rule.confidence}`,
    ""
  ].join("\n"));
  files.set("01-通用设计规则.md", [
    "# 通用设计规则",
    "",
    "> 这里只保留跨多个任务场景成立的规则。具体页面怎么组织，请回到场景正文。",
    "",
    rules.join("\n") || "当前没有经过验证的通用规则。\n"
  ].join("\n").trimEnd() + "\n");

  for (const category of data.categories || []) {
    const categoryScenarios = scenarios.filter((scenario) => scenario.categoryId === category.id);
    const body = categoryScenarios.map((scenario) => scenarioMarkdown(scenario, scenarioById, archetypeById, componentById)).join("\n");
    files.set(path.join("场景", category.file), [
      `# ${category.title}`,
      "",
      `> ${category.purpose}`,
      "",
      body || "当前没有达到收录条件的场景。后续扫描或人工确认后再补充。\n"
    ].join("\n").trimEnd() + "\n");
  }

  for (const component of components) {
    files.set(path.join("组件", component.file), componentMarkdown(component, scenarioById, componentById));
  }

  for (const page of pages) {
    files.set(path.join("页面", page.file), pageMarkdown(page, scenarioById, archetypeById, componentById));
  }

  const archetypeRows = (data.pageArchetypes || []).map((archetype) => {
    const titles = (archetype.scenarioIds || []).map((id) => {
      const scenario = scenarioById.get(id);
      const category = scenario ? categoryById.get(scenario.categoryId) : null;
      return scenario && category ? `[${scenario.title}](场景/${category.file}#${scenario.title})` : scenario?.title;
    }).filter(Boolean).join("、");
    const pageTitles = (archetype.pageIds || []).map((id) => {
      const page = pageById.get(id);
      return page ? `[${page.title}](页面/${page.file})` : null;
    }).filter(Boolean).join("、");
    return `| ${archetype.title} | ${archetype.summary} | ${titles || "暂无"} | ${pageTitles || "暂无"} |`;
  });
  files.set("02-页面形态索引.md", [
    "# 页面形态索引",
    "",
    "> 页面形态是辅助选择入口，不是另一套场景正文。请根据关联场景查看完整结构与状态。",
    "",
    "| 页面形态 | 解决的问题 | 关联场景 | 真实页面 |",
    "|---|---|---|---|",
    ...archetypeRows
  ].join("\n").trimEnd() + "\n");

  const moduleSections = (data.modules || []).map((module) => {
    const titles = (module.scenarioIds || []).map((id) => {
      const scenario = scenarioById.get(id);
      const category = scenario ? categoryById.get(scenario.categoryId) : null;
      return scenario && category ? `[${scenario.title}](场景/${category.file}#${scenario.title})` : scenario?.title;
    }).filter(Boolean);
    const pageTitles = (module.pageIds || []).map((id) => {
      const page = pageById.get(id);
      return page ? `[${page.title}](页面/${page.file})` : null;
    }).filter(Boolean);
    return [`## ${module.title}`, "", module.purpose || "", "", `关联页面：${pageTitles.join("、") || "暂无"}`, "", `关联场景：${titles.join("、") || "暂无"}`, ""].join("\n");
  });
  files.set("03-业务模块索引.md", [
    "# 业务模块索引",
    "",
    "> 用业务模块找到它实际使用的任务场景。场景规则只在场景目录维护。",
    "",
    moduleSections.join("\n") || "当前没有已归类的业务模块。\n"
  ].join("\n").trimEnd() + "\n");

  const componentRows = components.map((component) => {
    const scenarios = (component.scenarioRoles || []).map((item) => scenarioById.get(item.scenarioId)?.title).filter(Boolean).join("、");
    return `| [${component.title}](组件/${component.file}) | ${component.category} | ${component.purpose} | ${scenarios || "暂无"} |`;
  });
  files.set("04-组件使用规范索引.md", [
    "# 组件使用规范索引",
    "",
    "> 这里的组件是中文设计能力，不是源码实现名。先根据任务场景选择组件，再进入具体页面安排位置和搭配关系。",
    "",
    "| 组件 | 类型 | 解决的问题 | 适用场景 |",
    "|---|---|---|---|",
    ...componentRows
  ].join("\n").trimEnd() + "\n");

  const pendingSections = (data.pending || []).map((item) => [
    `## ${item.title}`,
    "",
    item.question,
    "",
    `**为什么需要确认：** ${item.impact}`,
    "",
    `**建议核对方式：** ${item.nextStep || "由设计或业务负责人确认。"}`,
    ""
  ].join("\n"));
  files.set("99-待确认事项.md", [
    "# 待确认事项",
    "",
    "> 证据不足、存在冲突或需要团队做规范选择的内容统一放在这里，不伪装成确定规则。",
    "",
    pendingSections.join("\n") || "当前没有待确认事项。\n"
  ].join("\n").trimEnd() + "\n");

  return files;
}

export function validateKnowledgeData(data, evidenceIds = new Set()) {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);

  if (data.schemaVersion !== SCHEMA_VERSION) fail(`schemaVersion 必须为 ${SCHEMA_VERSION}`);
  if (!Number.isInteger(data.revision) || data.revision < 1) fail("revision 必须为正整数");
  if (!data.project || typeof data.project !== "object") fail("缺少 project");

  if (data.scanState?.status === "initialized") {
    for (const key of ["categories", "generalRules", "components", "pageArchetypes", "scenarios", "pages", "modules", "pending"]) {
      if (!Array.isArray(data[key]) || data[key].length !== 0) fail(`初始化状态不应预置 ${key}`);
    }
  }

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
    ...(data.generalRules || []),
    ...(data.components || []),
    ...(data.pageArchetypes || []),
    ...(data.scenarios || []),
    ...(data.pages || []),
    ...(data.pending || [])
  ];
  const ids = allObjects.map((item) => item.id).filter(Boolean);
  if (ids.length !== allObjects.length) fail("存在缺少稳定 ID 的知识对象");
  if (new Set(ids).size !== ids.length) fail("稳定 ID 重复");

  const categoryIds = new Set((data.categories || []).map((item) => item.id));
  const scenarioIds = new Set((data.scenarios || []).map((item) => item.id));
  const componentIds = new Set((data.components || []).map((item) => item.id));
  const componentById = new Map((data.components || []).map((item) => [item.id, item]));
  const scenarioById = new Map((data.scenarios || []).map((item) => [item.id, item]));
  const pageIds = new Set((data.pages || []).map((item) => item.id));
  const archetypeIds = new Set((data.pageArchetypes || []).map((item) => item.id));
  const allowedStatuses = new Set(Object.keys(STATUS_LABELS));
  const allowedConfidence = new Set(Object.keys(CONFIDENCE_LABELS));

  for (const scenario of data.scenarios || []) {
    const label = scenario.id || "未知场景";
    if (!categoryIds.has(scenario.categoryId)) fail(`${label} 引用了不存在的场景分类`);
    if (!archetypeIds.has(scenario.pageArchetypeId)) fail(`${label} 引用了不存在的页面形态`);
    if (!scenario.title || !scenario.summary || !scenario.userGoal) fail(`${label} 缺少标题、摘要或用户目标`);
    if (!Array.isArray(scenario.applicableWhen) || scenario.applicableWhen.length === 0) fail(`${label} 缺少适用条件`);
    if (!Array.isArray(scenario.avoidWhen) || scenario.avoidWhen.length === 0) fail(`${label} 缺少不适用条件`);
    if (!scenario.pageShape?.summary || !Array.isArray(scenario.pageShape?.orderedRegions) || scenario.pageShape.orderedRegions.length === 0) fail(`${label} 缺少页面形态或区域顺序`);
    if (!Array.isArray(scenario.composition) || scenario.composition.length === 0) fail(`${label} 缺少功能组合`);
    if (!Array.isArray(scenario.componentRecipe?.required) || scenario.componentRecipe.required.length === 0) fail(`${label} 缺少必需组件配方`);
    if (!Array.isArray(scenario.componentRecipe?.conditional) || !Array.isArray(scenario.componentRecipe?.avoid)) fail(`${label} 的条件组件或避免组件配方不完整`);
    if (!Array.isArray(scenario.interactionFlow) || scenario.interactionFlow.length === 0) fail(`${label} 缺少任务顺序`);
    if (!Array.isArray(scenario.states) || scenario.states.length === 0) fail(`${label} 缺少关键状态`);
    if (!allowedStatuses.has(scenario.status)) fail(`${label} 的 status 不受支持`);
    if (!allowedConfidence.has(scenario.confidence)) fail(`${label} 的 confidence 不受支持`);
    for (const relationId of [...(scenario.relations?.mayLeadTo || []), ...(scenario.relations?.related || [])]) {
      if (!scenarioIds.has(relationId)) fail(`${label} 引用了不存在的关联场景 ${relationId}`);
    }
    for (const item of [
      ...(scenario.componentRecipe?.required || []),
      ...(scenario.componentRecipe?.conditional || []),
      ...(scenario.componentRecipe?.avoid || [])
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
    for (const evidenceId of scenario.evidenceRefs || []) {
      if (!evidenceIds.has(evidenceId)) fail(`${label} 引用了不存在的证据 ${evidenceId}`);
    }
  }

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
    for (const role of component.scenarioRoles || []) {
      if (!scenarioIds.has(role.scenarioId)) fail(`${label} 引用了不存在的场景 ${role.scenarioId}`);
      if (!role.role || !role.when) fail(`${label} 的场景角色缺少角色或出现条件`);
      const scenario = scenarioById.get(role.scenarioId);
      const recipeItems = scenario ? [
        ...(scenario.componentRecipe?.required || []),
        ...(scenario.componentRecipe?.conditional || [])
      ] : [];
      if (scenario && !recipeItems.some((item) => item.componentId === component.id)) {
        fail(`${label} 声明了场景 ${role.scenarioId}，但该场景配方没有引用此组件`);
      }
    }
    for (const rule of component.compositionRules || []) {
      if (!componentIds.has(rule.withComponentId)) fail(`${label} 引用了不存在的组合组件 ${rule.withComponentId}`);
      if (!rule.relationship || !rule.when) fail(`${label} 的组件组合规则缺少关系或条件`);
    }
    for (const evidenceId of component.evidenceRefs || []) {
      if (!evidenceIds.has(evidenceId)) fail(`${label} 引用了不存在的证据 ${evidenceId}`);
    }
    componentFiles.push(component.file);
  }
  if (new Set(componentFiles).size !== componentFiles.length) fail("设计组件文件名重复");

  function validateRegion(region, pageLabel, regionIds) {
    if (!region.id || regionIds.has(region.id)) fail(`${pageLabel} 存在缺少或重复 ID 的页面区域`);
    if (region.id) regionIds.add(region.id);
    for (const key of ["name", "placement", "purpose", "priority", "sizing", "layout", "relationship"]) {
      if (!region[key]) fail(`${pageLabel} 的区域 ${region.id || "未知区域"} 缺少 ${key}`);
    }
    if (!Array.isArray(region.components) || region.components.length === 0) fail(`${pageLabel} 的区域 ${region.id || "未知区域"} 缺少组件实例`);
    for (const instance of region.components || []) {
      if (!componentIds.has(instance.componentId)) fail(`${pageLabel} 的区域 ${region.id} 引用了不存在的设计组件 ${instance.componentId}`);
      for (const key of ["role", "placement", "sizing", "content", "behavior", "visibleWhen"]) {
        if (!instance[key]) fail(`${pageLabel} 的组件实例 ${instance.componentId || "未知组件"} 缺少 ${key}`);
      }
      if (!Array.isArray(instance.states) || instance.states.length === 0) fail(`${pageLabel} 的组件实例 ${instance.componentId || "未知组件"} 缺少局部状态`);
    }
    if (region.children !== undefined && !Array.isArray(region.children)) fail(`${pageLabel} 的区域 ${region.id} children 必须为数组`);
    for (const child of region.children || []) validateRegion(child, pageLabel, regionIds);
  }

  const pageFiles = [];
  const coverageValues = new Set(["complete", "partial", "unknown", "not-applicable"]);
  for (const page of data.pages || []) {
    const label = page.id || "未知页面";
    if (!page.title || !page.file || !page.summary || !page.userGoal || !page.entry) fail(`${label} 缺少标题、文件、摘要、目标或入口`);
    if (!archetypeIds.has(page.pageArchetypeId)) fail(`${label} 引用了不存在的页面形态`);
    if (!Array.isArray(page.scenarioIds) || page.scenarioIds.length === 0) fail(`${label} 缺少关联场景`);
    for (const scenarioId of page.scenarioIds || []) if (!scenarioIds.has(scenarioId)) fail(`${label} 引用了不存在的场景 ${scenarioId}`);
    const structure = page.pageStructure;
    if (!structure?.overview) fail(`${label} 缺少页面全景摘要`);
    for (const key of ["applicationFrame", "navigation", "contentCanvas", "scrolling", "overlays"]) {
      if (!structure?.shell?.[key]) fail(`${label} 的页面外壳缺少 ${key}`);
    }
    for (const key of ["summary", "direction", "primary", "secondary"]) {
      if (!structure?.layout?.[key]) fail(`${label} 的布局骨架缺少 ${key}`);
    }
    if (!Array.isArray(structure?.layout?.relationships) || structure.layout.relationships.length === 0) fail(`${label} 缺少区域关系`);
    if (!Array.isArray(structure?.regions) || structure.regions.length === 0) fail(`${label} 缺少页面区域树`);
    const regionIds = new Set();
    for (const region of structure?.regions || []) validateRegion(region, label, regionIds);
    const pageComponentIds = [];
    const collectPageComponents = (regions) => {
      for (const region of regions || []) {
        pageComponentIds.push(...(region.components || []).map((item) => item.componentId));
        collectPageComponents(region.children);
      }
    };
    collectPageComponents(structure?.regions);
    for (const componentId of pageComponentIds) {
      const component = componentById.get(componentId);
      if (component && !(component.scenarioRoles || []).some((role) => page.scenarioIds.includes(role.scenarioId))) {
        fail(`${label} 使用的组件 ${componentId} 没有与页面关联场景对应的角色`);
      }
    }
    if (!Array.isArray(page.interactionFlow) || page.interactionFlow.length === 0) fail(`${label} 缺少页面任务流程`);
    if (!Array.isArray(page.states) || page.states.length === 0) fail(`${label} 缺少页面关键状态`);
    for (const state of page.states || []) {
      if (!state.name || !state.trigger || !state.recovery || !Array.isArray(state.changes) || state.changes.length === 0) fail(`${label} 的页面状态不完整`);
    }
    if (!Array.isArray(page.responsiveRules) || page.responsiveRules.length === 0) fail(`${label} 缺少空间适配规则`);
    if (!Array.isArray(page.designBoundaries) || page.designBoundaries.length === 0) fail(`${label} 缺少设计边界`);
    for (const key of ["shell", "layout", "components", "states", "responsive"]) {
      if (!coverageValues.has(page.coverage?.[key])) fail(`${label} 的 ${key} 覆盖状态不受支持`);
    }
    if (!allowedStatuses.has(page.status)) fail(`${label} 的 status 不受支持`);
    if (!allowedConfidence.has(page.confidence)) fail(`${label} 的 confidence 不受支持`);
    for (const evidenceId of page.evidenceRefs || []) {
      if (!evidenceIds.has(evidenceId)) fail(`${label} 引用了不存在的证据 ${evidenceId}`);
    }
    pageFiles.push(page.file);
  }
  if (new Set(pageFiles).size !== pageFiles.length) fail("页面蓝图文件名重复");

  for (const archetype of data.pageArchetypes || []) {
    for (const scenarioId of archetype.scenarioIds || []) {
      if (!scenarioIds.has(scenarioId)) fail(`${archetype.id} 引用了不存在的场景 ${scenarioId}`);
    }
    for (const pageId of archetype.pageIds || []) {
      if (!pageIds.has(pageId)) fail(`${archetype.id} 引用了不存在的页面 ${pageId}`);
    }
  }
  for (const module of data.modules || []) {
    for (const scenarioId of module.scenarioIds || []) {
      if (!scenarioIds.has(scenarioId)) fail(`业务模块 ${module.title} 引用了不存在的场景 ${scenarioId}`);
    }
    for (const pageId of module.pageIds || []) {
      if (!pageIds.has(pageId)) fail(`业务模块 ${module.title} 引用了不存在的页面 ${pageId}`);
    }
  }

  const coverage = data.scanState?.coverage;
  if (!coverage) {
    fail("缺少 scanState.coverage");
  } else {
    const keys = ["total", "complete", "needsRuntime", "excluded", "uncovered"];
    if (keys.some((key) => !Number.isInteger(coverage[key]) || coverage[key] < 0)) {
      fail("扫描覆盖数必须是非负整数");
    } else if (coverage.total !== coverage.complete + coverage.needsRuntime + coverage.excluded + coverage.uncovered) {
      fail("扫描覆盖分项之和必须等于 total");
    }
  }
  const componentCoverage = data.scanState?.componentCoverage;
  if (!componentCoverage) {
    fail("缺少 scanState.componentCoverage");
  } else {
    const keys = ["total", "complete", "needsRuntime", "excluded", "uncovered"];
    if (keys.some((key) => !Number.isInteger(componentCoverage[key]) || componentCoverage[key] < 0)) {
      fail("组件扫描覆盖数必须是非负整数");
    } else if (componentCoverage.total !== componentCoverage.complete + componentCoverage.needsRuntime + componentCoverage.excluded + componentCoverage.uncovered) {
      fail("组件扫描覆盖分项之和必须等于 total");
    }
  }

  if ((data.scenarios || []).length === 0) warn("知识库尚未收录场景");
  if ((data.components || []).length === 0) warn("知识库尚未收录组件规范");
  if ((data.pages || []).length === 0) warn("知识库尚未收录页面蓝图");
  if ((data.project?.unknowns || []).length > 0) warn(`仍有 ${data.project.unknowns.length} 个项目画像未知项`);
  if ((data.pending || []).length > 0) warn(`仍有 ${data.pending.length} 个待确认事项`);

  return { errors, warnings };
}

export function validateVisibleFiles(root, data) {
  const errors = [];
  const warnings = [];
  const visibleRoot = path.join(root, VISIBLE_DIR);
  const expected = [...renderKnowledge(data).keys()];
  for (const relativePath of expected) {
    const filePath = path.join(visibleRoot, relativePath);
    if (!fs.existsSync(filePath)) errors.push(`缺少可见文档：${path.join(VISIBLE_DIR, relativePath)}`);
  }
  if (!fs.existsSync(visibleRoot)) return { errors: [`缺少 ${VISIBLE_DIR}`], warnings };

  const forbidden = [
    { pattern: /\b(?:React|Vue|Angular|TypeScript|JavaScript|props?|component|router|store)\b/gi, label: "框架或工程术语" },
    { pattern: /(?:^|[\s(])(?:src|app|pages|components)\/[\w./-]+/gim, label: "源码路径" },
    { pattern: /\.(?:tsx?|jsx?|vue|svelte|css|scss|less)\b/gi, label: "源码文件扩展名" },
    { pattern: /\b[a-z]{1,8}-[a-z][a-z0-9-]{2,}\b/g, label: "疑似工程组件名" }
  ];
  for (const relativePath of expected) {
    const filePath = path.join(visibleRoot, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) errors.push(`${path.join(VISIBLE_DIR, relativePath)} 含${rule.label}`);
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

export function validateRoot(root) {
  const internalRoot = path.join(root, INTERNAL_DIR);
  const knowledgePath = path.join(internalRoot, "knowledge.json");
  const evidencePath = path.join(internalRoot, "evidence.jsonl");
  if (!fs.existsSync(knowledgePath)) {
    return { errors: [`缺少 ${path.join(INTERNAL_DIR, "knowledge.json")}`], warnings: [] };
  }
  let data;
  let evidence;
  try {
    data = readJson(knowledgePath);
    evidence = readJsonl(evidencePath);
  } catch (error) {
    return { errors: [error.message], warnings: [] };
  }
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const structure = validateKnowledgeData(data, evidenceIds);
  const visible = validateVisibleFiles(root, data);
  return {
    errors: [...structure.errors, ...visible.errors],
    warnings: [...structure.warnings, ...visible.warnings],
    data
  };
}
