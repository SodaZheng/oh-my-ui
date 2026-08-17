# 共同知识契约

## 两个界面与两个根目录

知识库同时服务两类读者，但不能混在一起：

1. `<knowledgeRoot>/doc/ui/UI设计知识库/` 是给设计师和产品人员看的中文派生视图，只维护通用规则、场景、组件、来源索引、案例索引和待确认事项。
2. `<knowledgeRoot>/doc/ui/.ui-knowledge/` 是 Agent 使用的隐藏事实源，可以保存稳定 ID、项目定位、真实页面实例、证据、可信度、版本和变更记录。

扫描输入与知识库输出必须分离：

- `sourceRoot`：本次读取的 A、B、C 等前端项目，只贡献观察、实例和证据。
- `knowledgeRoot`：持续累积的统一知识库。不同来源项目都归并到这一位置。

可见文档是派生视图；`knowledge.json` 是当前事实源。不要直接修改派生视图。所有确定性脚本只接收 `knowledgeRoot`；扫描 Skill 另外读取 `sourceRoot`。

## 主知识与实例证据

可复用主知识只有两层：

1. 组件能力回答“什么时候使用、与什么搭配”。
2. 场景配方回答“用户为什么需要这些能力、页面形态和布局如何组织”。

真实页面不再作为平级规范正文。它以 `pageInstances` 保存在隐藏事实源中，记录某个来源项目里“多个场景怎样被组合成一张实际页面”。设计师可以通过场景正文里的案例摘要和项目案例索引发现实例，但不会看到另一套页面规范。

页面形态是场景的 `pagePattern.form`，页面形态索引由场景派生；业务模块是页面实例的来源属性。二者都不维护重复正文。

## 初始化边界

`init-kb.mjs` 只创建统一知识库空 schema、上下文策略和证据/变更文件。初始化后以下集合必须为空：

- `sourceProjects`
- `categories`
- `generalRules`
- `components`
- `scenarios`
- `pageInstances`
- `pending`

来源项目只有在用户要求扫描该项目后才登记。不得把演示知识、通用 UI 分类或其他知识库内容预置到新库。

## 隐藏事实源

`knowledge.json` 至少包含：

```json
{
  "schemaVersion": "2.0.0",
  "revision": 1,
  "library": {},
  "contextPolicy": {},
  "sourceProjects": [],
  "categories": [],
  "generalRules": [],
  "components": [],
  "scenarios": [],
  "pageInstances": [],
  "pending": []
}
```

稳定 ID 前缀：来源项目 `PRJ-`、通用规则 `R-`、设计组件 `CP-`、场景 `S-`、场景变体 `SV-`、页面实例 `PI-`、待确认项 `Q-`、证据 `E-`、变更 `CR-`。ID 一旦发布不得因标题、路径或项目移动而重建。

## 来源项目

每次扫描先登记或定位来源项目：

```json
{
  "id": "PRJ-A",
  "name": "项目 A",
  "kind": "frontend-project",
  "sourceLocator": "内部定位",
  "identity": {
    "stableKey": "不随本地路径变化的稳定身份键",
    "aliases": ["历史名称或路径提示"]
  },
  "profile": {},
  "unknowns": [],
  "scanState": {
    "status": "initialized",
    "routeLedger": [],
    "componentLedger": [],
    "coverage": {
      "total": 0,
      "complete": 0,
      "needsRuntime": 0,
      "excluded": 0,
      "uncovered": 0
    },
    "componentCoverage": {
      "total": 0,
      "complete": 0,
      "needsRuntime": 0,
      "excluded": 0,
      "uncovered": 0
    },
    "blindSpots": []
  },
  "addedAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

`sourceLocator`、路由、文件定位和工程身份只允许出现在隐藏事实源。`stableKey` 优先来自用户明确指定的项目 ID、规范化仓库远端与清单名称等非路径信号；本地路径只能放入 `aliases`，不能单独决定身份。每个来源项目分别维护扫描分母，统一导航只做累计汇总。

项目移动后的匹配顺序：明确 `PRJ-` ID > 已登记 `stableKey` > 仓库远端与清单名称组合 > 入口/模块画像。仍有两个以上候选时必须让用户确认，不能把“移动后的 A”静默登记为新 B。

优先运行 `derive-source-key.mjs <sourceRoot> [--id <明确项目ID>]` 生成统一格式。工具会去除 Git 远端中的凭证和传输差异，并结合项目清单名称；如果只能看到本地路径，它会返回 `ambiguous`，不会伪造稳定键。

## 知识状态

每条知识标明 `status`：

- `observed`：某个来源项目中观察到的事实。
- `candidate`：由一条或多条观察归纳出的候选规律。
- `normative`：经过团队明确确认的设计规范。
- `exception`：只在限定条件下覆盖一般规则。
- `hypothesis`：尚待验证，不参与强制推断。

`confidence` 使用 `low`、`medium`、`high`。跨项目重复只增加证据广度和可信度判断材料，不能自动把候选内容升级为 `normative`。

## 场景语义身份与归并

场景不能按标题去重。每个场景使用稳定的 `semanticKey`，并保存用于判断的 `semanticProfile`：

```json
{
  "semanticKey": "稳定语义键",
  "semanticProfile": {
    "userGoal": "用户最终要得到什么",
    "objectScope": "单对象、集合或跨对象汇总",
    "taskStage": "查找、理解、输入、判断、执行、追踪或恢复",
    "duration": "即时或长时间",
    "risk": "风险、可逆性和影响范围",
    "result": "单一成功、部分成功、排队或可恢复失败"
  }
}
```

新来源项目的观察与现有场景比较后只能采用四种处理：

1. 语义相同：复用原场景 ID，追加 `sourceProjectIds`、证据和页面实例。
2. 主任务相同但条件差异稳定：追加 `variants`，写清条件、差异和来源。
3. 同一条件下结论冲突：双方都保留，建立待确认项。
4. 用户目标、对象范围、阶段、风险或结果方式实质不同：创建新场景。

标题相似不能合并；工程实现不同也不能阻止语义相同的场景归并。

## 组件最小结构

组件名称使用中文设计能力，不等同于源码实现名。每个组件至少包含：

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
    { "withComponentId": "CP-002", "relationship": "空间或交互关系", "when": "成立条件" }
  ],
  "contentRules": ["内容规则"],
  "layoutRules": ["布局规则"],
  "interactionRules": ["交互规则"],
  "states": [{ "name": "状态名", "expectation": "设计预期" }],
  "sourceProjectIds": ["PRJ-A"],
  "evidenceRefs": ["E-001"],
  "status": "candidate",
  "confidence": "medium"
}
```

多个工程组件解决相同问题且规则一致时可以归并为一种能力；同一工程组件承担不同设计语义时必须拆分。

## 场景最小结构

场景是跨项目复用的主知识，至少包含：

- 用户目标、语义画像、适用和不适用条件。
- 推荐页面形态、布局骨架、区域顺序和选择理由。
- 功能组合，以及必需、条件、避免组件配方。
- 用户任务顺序、关键状态、前后场景和设计边界。
- 跨项目变体、来源项目、实例引用、证据、状态和可信度。

核心结构：

```json
{
  "id": "S-001",
  "semanticKey": "稳定语义键",
  "semanticProfile": {},
  "pagePattern": {
    "form": "中文页面形态",
    "summary": "页面整体形态",
    "layout": {
      "direction": "主布局方向",
      "primary": "主区域",
      "secondary": "次要区域",
      "relationships": ["区域关系"]
    },
    "orderedRegions": [
      { "name": "区域名", "purpose": "为什么存在" }
    ]
  },
  "componentRecipe": {
    "required": [
      { "componentId": "CP-001", "role": "职责", "placement": "位置", "reason": "理由" }
    ],
    "conditional": [
      { "componentId": "CP-002", "role": "职责", "placement": "位置", "when": "条件", "reason": "理由" }
    ],
    "avoid": [
      { "componentId": "CP-003", "role": "避免用法", "placement": "不应出现的位置", "reason": "理由" }
    ]
  },
  "variants": [
    {
      "id": "SV-001",
      "title": "变体名称",
      "conditions": ["适用条件"],
      "differences": ["相对主场景的差异"],
      "sourceProjectIds": ["PRJ-B"],
      "evidenceRefs": ["E-002"]
    }
  ],
  "exampleInstanceIds": ["PI-001"],
  "sourceProjectIds": ["PRJ-A", "PRJ-B"]
}
```

## 页面实例最小结构

页面实例不是规范，而是某个来源项目中的组合观察。它必须能回答场景如何真正落到页面，并保留：

- 唯一来源项目、业务模块、页面形态、入口、用户目标和关联场景。
- 应用外壳、导航、画布、滚动和覆盖层。
- 区域树、组件实例、主次关系、空间占用和相邻关系。
- 页面任务流、区域级状态变化、响应式规则和设计边界。
- 外壳、布局、组件、状态、适配五维覆盖状态。
- 证据、知识状态与可信度。

结构沿用页面蓝图的详细字段，但使用 `PI-` ID，并新增：

```json
{
  "id": "PI-001",
  "sourceProjectId": "PRJ-A",
  "sourceLocator": "内部入口定位",
  "title": "中文页面实例名",
  "businessModule": "来源项目中的业务模块",
  "pageForm": "页面形态",
  "scenarioIds": ["S-001", "S-006"],
  "pageStructure": {},
  "interactionFlow": [],
  "states": [],
  "responsiveRules": [],
  "designBoundaries": [],
  "coverage": {},
  "evidenceRefs": []
}
```

同一页面组合多个场景是正常情况。`scenarios[].exampleInstanceIds` 与 `pageInstances[].scenarioIds` 必须双向一致。

## 证据与变更

`evidence.jsonl` 每行保存一条最小可复核证据，并必须指明来源项目：

```json
{"id":"E-001","sourceProjectId":"PRJ-A","kind":"source|runtime|test|human","locator":"内部定位","summary":"观察摘要","supports":["S-001","PI-001"],"capturedAt":"ISO-8601"}
```

`changes.jsonl` 只保存已提交或已拒绝的变更记录。扫描新项目、语义归并、场景拆分、变体声明和规范更正都必须经过候选版本校验与原子提交。

新增证据时，`commit-kb.mjs` 的第四个参数必须提供包含“全部既有证据 + 本次新增证据”的候选 `evidence.jsonl`。知识、证据、可见视图和变更记录必须进入同一事务；不得先手工追加正式证据。

提交器默认拒绝删除任何既有来源、知识对象或证据。确需删除时，必须在更正预览后把精确 ID 同时列入 `targets` 和 `allowRemovals`。`source-scan` 变更还必须声明 `sourceProjectIds`，不得修改作用域外项目的画像、页面实例或证据。

## 设计师语言禁区

可见文档不得包含工程组件名、属性名、函数名、类名、文件名、源码路径、框架术语、内部 ID 或代码片段。未经证据确认的颜色、像素、字号和品牌规则不得猜测。

## 不确定性规则

- 看不到不等于不存在，未覆盖不等于不适用。
- 同一路由在不同角色、状态或入口下结构不同，应拆成扫描单位或页面实例变体。
- 不同项目出现相同实现只能增加证据，不能自动成为规范。
- 冲突不能静默覆盖；缩小条件、声明限定变体，或进入待确认。
- 页面实例永远保留来源，不能被改写成无来源的通用页面规则。
