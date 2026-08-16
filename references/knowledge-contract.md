# 共同知识契约

## 两个界面

知识库同时服务两类读者，但不能混在一起：

1. `doc/ui/UI设计知识库/` 是给设计师和产品人员看的中文视图。它只描述用户任务、页面形态、区域组合、流程、状态和适用边界。
2. `doc/ui/.ui-knowledge/` 是 Agent 使用的隐藏事实源。它可以保存稳定 ID、证据引用、路由定位、可信度、版本和变更记录。

可见文档是派生视图；`doc/ui/.ui-knowledge/knowledge.json` 是当前事实源。不要直接手改派生视图后遗漏事实源。插件所有脚本都接收目标项目根目录，并自行解析到 `doc/ui/`；不得要求用户把脚本参数改成知识库目录。

## 可见分层

主分层使用从真实页面任务中归纳出的用户场景。场景名称、数量和分组都不是预置枚举：它们必须来自页面入口、用户目标、对象范围、任务阶段、风险、结果方式和真实组件组合。不同项目可以形成完全不同的场景分组。

页面蓝图用于还原真实页面，组件能力用于解释组件选择，页面形态和业务模块用于辅助索引。场景规律只有一份正文，通过页面、组件和索引引用，禁止复制成多套互相漂移的内容。

详细层级统一遵循 [UI 描述统一架构](ui-description-architecture.md)：组件能力 → 场景配方 → 页面蓝图。源码扫描与 PRD 查询不得各自维护另一套输出结构。

## 初始化边界

`init-kb.mjs` 只负责创建空 schema、项目元数据、扫描账本、覆盖计数和证据/变更文件。初始化后以下集合都必须为空：

- `categories`
- `generalRules`
- `components`
- `pageArchetypes`
- `scenarios`
- `pages`
- `modules`
- `pending`

这些对象只能在读取目标项目源码、真实调用、运行页面、测试或人工证据后生成。不得把演示知识、通用 UI 分类或其他项目的场景复制进新知识库。

## 知识层级

每条知识必须标明 `status`：

- `observed`：从源码、运行页面或测试中观察到的事实。
- `candidate`：由多条观察归纳出的候选规律，尚未人工确认。
- `normative`：经过明确确认，可作为后续设计约束。
- `exception`：只在限定条件下覆盖一般规则。
- `hypothesis`：尚待验证的想法，不用于强制推断。

`confidence` 使用 `low`、`medium`、`high`。状态和可信度是两个维度：已确认的规范可以因覆盖不足而保持中等可信度，强证据观察也不自动成为规范。

## 隐藏事实源

`doc/ui/.ui-knowledge/knowledge.json` 至少包含：

```json
{
  "schemaVersion": "1.1.0",
  "revision": 1,
  "project": {},
  "contextPolicy": {},
  "scanState": {},
  "categories": [],
  "generalRules": [],
  "components": [],
  "pageArchetypes": [],
  "scenarios": [],
  "pages": [],
  "modules": [],
  "pending": []
}
```

稳定 ID 前缀：通用规则 `R-`、设计组件 `CP-`、页面形态 `P-`、场景 `S-`、页面蓝图 `PG-`、待确认项 `Q-`、证据 `E-`、变更 `CR-`。ID 一旦发布不得因标题变化而重建。

`categories` 是扫描后生成的场景分组，不是固定分类表。只有当至少一个场景已经有证据并需要组织时才创建分组；分组标题应来自项目的真实任务语言。

`evidence.jsonl` 每行保存一条证据，可含工程定位，但只保存复核所需的最小片段与摘要：

```json
{"id":"E-001","kind":"source|runtime|test|human","locator":"内部定位","summary":"观察摘要","supports":["S-001"],"capturedAt":"ISO-8601"}
```

`changes.jsonl` 仅保存已提交或已拒绝的变更记录。预览中的提案可以放临时目录，不得混入正式历史。

## 组件最小结构

每个设计组件需要回答：

- 它解决什么交互问题，适用与不适用条件是什么。
- 在哪些场景中承担什么角色，何时必需、何时条件出现。
- 与其他组件的前后、控制、反馈或容纳关系。
- 内容、布局、交互、状态和适配规则。
- 关联场景、证据、知识状态与可信度。

组件名称使用中文设计类型，不等同于源码实现名。工程定位只保存在证据层。

组件结构使用：

```json
{
  "id": "CP-001",
  "title": "中文设计组件名",
  "file": "中文设计组件名.md",
  "category": "设计能力分类",
  "summary": "一句话摘要",
  "purpose": "解决的问题",
  "applicableWhen": ["适用条件"],
  "avoidWhen": ["不适用条件"],
  "scenarioRoles": [
    { "scenarioId": "S-001", "role": "在场景中的职责", "when": "出现条件" }
  ],
  "compositionRules": [
    { "withComponentId": "CP-002", "relationship": "空间或交互关系", "when": "关系成立条件" }
  ],
  "contentRules": ["内容规则"],
  "layoutRules": ["布局规则"],
  "interactionRules": ["交互规则"],
  "states": [{ "name": "状态名", "expectation": "设计预期" }],
  "evidenceRefs": ["E-001"],
  "status": "observed",
  "confidence": "medium"
}
```

## 场景最小结构

每个场景需要回答：

- 用户要完成什么结果，何时触发。
- 适用与不适用条件。
- 页面整体长什么样，主次区域如何排列。
- 每个功能区域为什么存在，而不是它由什么工程组件实现。
- 必需组件、条件组件和应避免组件的角色、位置、条件与理由。
- 用户完成任务的顺序。
- 初始、加载、空、失败、权限、部分成功等相关状态。
- 与前后场景的关系。
- 业务模块、页面形态、证据、状态与可信度。

场景在既有字段之外必须包含：

```json
{
  "componentRecipe": {
    "required": [
      {
        "componentId": "CP-001",
        "role": "为什么需要",
        "placement": "在页面中的位置",
        "reason": "选择理由"
      }
    ],
    "conditional": [
      {
        "componentId": "CP-002",
        "role": "条件角色",
        "placement": "出现位置",
        "when": "出现条件",
        "reason": "选择理由"
      }
    ],
    "avoid": [
      {
        "componentId": "CP-003",
        "role": "需要避免的用法",
        "placement": "不应进入的位置",
        "reason": "避免理由"
      }
    ]
  }
}
```

## 页面蓝图最小结构

每个从源码观察到的真实页面至少包含：

- 页面定位、入口、用户目标、关联场景和页面形态。
- 应用外壳、导航、内容画布、滚动和覆盖层关系。
- 从大到小的区域树：位置、优先级、空间占用、内部布局和相邻关系。
- 每个区域中的组件实例：组件类型、业务角色、内容、位置、伸缩、交互、出现条件和局部状态。
- 页面级任务流、状态变化、响应式或空间适配规则。
- 外壳、布局、组件、状态和适配五个维度的覆盖状态；未覆盖不能伪装成不存在。
- 证据、知识状态和可信度。

页面蓝图结构使用：

```json
{
  "id": "PG-001",
  "title": "中文页面名",
  "file": "中文页面名.md",
  "summary": "页面摘要",
  "userGoal": "用户目标",
  "entry": "进入方式和返回关系",
  "pageArchetypeId": "P-001",
  "scenarioIds": ["S-001"],
  "pageStructure": {
    "overview": "页面全景",
    "shell": {
      "applicationFrame": "应用外壳",
      "navigation": "导航关系",
      "contentCanvas": "内容画布",
      "scrolling": "滚动策略",
      "overlays": "覆盖层策略"
    },
    "layout": {
      "summary": "布局摘要",
      "direction": "主布局方向",
      "primary": "主区域",
      "secondary": "次要区域",
      "relationships": ["区域关系"]
    },
    "regions": [
      {
        "id": "RG-PG001-001",
        "name": "区域名",
        "placement": "位置",
        "purpose": "目的",
        "priority": "优先级",
        "sizing": "空间占用和伸缩",
        "layout": "内部布局",
        "relationship": "相邻或控制关系",
        "components": [
          {
            "componentId": "CP-001",
            "name": "页面内名称",
            "role": "业务角色",
            "placement": "区域内位置",
            "sizing": "尺寸或伸缩方式",
            "content": "内容",
            "behavior": "交互",
            "visibleWhen": "出现条件",
            "states": ["局部状态"]
          }
        ],
        "children": []
      }
    ]
  },
  "interactionFlow": ["用户任务步骤"],
  "states": [
    {
      "name": "页面状态",
      "trigger": "触发条件",
      "changes": [{ "region": "受影响区域", "change": "具体变化" }],
      "recovery": "恢复或下一步"
    }
  ],
  "responsiveRules": ["空间适配规则或明确的未确认项"],
  "designBoundaries": ["设计边界"],
  "coverage": {
    "shell": "complete|partial|unknown|not-applicable",
    "layout": "complete|partial|unknown|not-applicable",
    "components": "complete|partial|unknown|not-applicable",
    "states": "complete|partial|unknown|not-applicable",
    "responsive": "complete|partial|unknown|not-applicable"
  },
  "evidenceRefs": ["E-001"],
  "status": "observed",
  "confidence": "medium"
}
```

`pageArchetypes[].pageIds` 和 `modules[].pageIds` 用于反向索引页面；`scanState.componentLedger` 与 `scanState.componentCoverage` 分别保存组件扫描检查点和覆盖分母。

## 设计师语言禁区

可见文档不得包含：

- 工程组件名或带前缀的实现名。
- 属性名、事件名、函数名、类名、文件名和源码路径。
- 路由库、状态库、UI 框架和模板语法。
- “这里放一个某某控件”式实现指令。
- 未经确认的颜色、像素、字号或品牌视觉规范。

应改写为功能和关系，例如“用于缩小结果范围的条件区”“保持当前任务上下文的侧向辅助区域”。

## 不确定性规则

- 看不到不等于不存在，未覆盖不等于不适用。
- 条件分支未追踪完时必须保留未知。
- 同一路由在不同角色、状态或入口下结构不同，应拆成扫描单位或状态变体。
- 冲突不能静默覆盖；保留双方条件，进入待确认或限定例外。
