# Codeup 提交日志

Windows 桌面工具：对接阿里云云效 Codeup，多账号切换，定时增量同步提交，生成本地日/周/月报 Markdown 草稿；可选接入 OpenAI 兼容模型，按配置提示词润色日报摘要。

## 功能

- 多账号管理（中心版 / Region 版），PAT 使用 Electron `safeStorage` 加密存放
- 拉取可见仓库、勾选关注范围、按仓覆盖分支
- 定时 / 手动增量同步 `ListCommits`，按作者过滤
- 提交时间线浏览；按日落盘材料；预览日/周/月报草稿
- **AI 润色**（可选）：OpenAI 兼容接口（DeepSeek / Kimi / 自建），可配置提示词；在报告页对日报做摘要润色

## 准备云效凭证

1. 登录 [云效工作台](https://devops.aliyun.com/) → 头像 → **个人设置** → **个人访问令牌** → 新建  
   - **代码管理** 权限至少：
     - **代码仓库** → 只读（拉仓库列表必需）
     - **提交** → 只读（拉提交历史必需）
     - 建议同时：**代码组**、**分支** → 只读
   - 改权限后若仍 403，请**删除旧令牌并新建**（不要只改旧令牌），再粘贴新 `pt-...` 到本工具
2. 确认组织类型（选错会 403）：
   - **中心版**：organizationId 来自「组织管理 → 基本信息」，接入点 `openapi-rdc.aliyuncs.com`
   - **Region 版**：填实例 API Base URL，**不要**填 organizationId
3. （可选）账号里填作者邮箱/姓名过滤，只收自己的提交

## AI 日报（可选）

**配置**在左侧 **设置 → AI 配置**：

1. 填写 **Base URL**（如 DeepSeek `https://api.deepseek.com/v1`、Kimi `https://api.moonshot.cn/v1`）
2. 填写 **模型名** 与 **API Key**（密钥加密存放，不进 `settings.json`）
3. 按需改 System / User 提示词；User 模板可用 `{{kind}}`、`{{period}}`（与 `{{date}}` 同值）、`{{accountName}}`、`{{commitCount}}`、`{{commits}}`
4. 「测试连接」验证接口

**使用**在 **报告** 页：选择日 / 周 / 月 / 自定义区间 →「预览」模板草稿 → 不满意再「AI 润色」→ 复制。AI 结果仅存内存（抽屉内），不落盘；关闭应用即清空。无提交时无法润色。

（定时自动日报暂未开放。）

## 开发运行

```bash
npm install
npm run dev
```

Electron 二进制默认走 npmmirror（见 `.npmrc`）。

## 打包安装包

应用图标在 `build/icon.ico`（安装包 / exe）与 `resources/`（窗口、托盘）。

```bash
npm run dist
```

会先执行 `electron-vite build`，再用 electron-builder 打 Windows NSIS 安装包。产物在 `release/`：

- `Codeup提交日志 Setup x.x.x.exe` — 安装程序（可改安装目录）
- `win-unpacked/` — 免安装绿色版目录

## 数据目录

应用配置与账号数据位于 Electron `userData` 下：

```text
%APPDATA%/codeup-journal/   # 即 Electron userData
  accounts.json
  settings.json      # 同步间隔/回溯、AI 非密钥配置（含每日时刻、提示词）
  secrets/           # 加密 PAT、AI API Key（ai-api-key.bin）
  data.json          # 仓库、提交、同步状态
  exports/           # 默认材料目录（可在「设置」中自定义）
```

材料落盘目录在左侧「设置」中配置；可选择任意本地文件夹，或恢复默认 `exports/`。按日材料与 `reports/` 报告都写在该根目录下。

## 使用流程

1. **账号**：新建账号 → 填组织信息与 PAT → 测试连接 → 保存  
2. **仓库**：从 Codeup 刷新 → 勾选关注（可不选=全部）→ 保存  
3. 点顶栏 **立即同步**，或等待定时同步  
4. **提交** 中查看时间线；**报告** 中预览或 AI 润色后复制  
5. （可选）**设置 → AI 配置** 填模型与 Key，在报告页按需润色 

## 技术栈

Electron + electron-vite + React + TypeScript + Ant Design
