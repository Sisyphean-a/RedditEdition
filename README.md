# VS Code Stealth Reader (Reddit Edition)

这是一个伪装成日志查看器的 Reddit 阅读扩展。它将 Reddit 的内容拉取并自动翻译成中文，以 `.log` 文件形式展示，让你在工作时“隐蔽”地浏览 Reddit。

## ✨ 核心特性

- **隐蔽阅读**：UI 伪装成普通日志文件，完全禁用 Webview，外观与服务器日志无异。
- **全中文体验**：
  - **AI 翻译 (推荐)**：使用 Gemini 2.0 Flash 模型，支持上下文理解，翻译地道。
  - **由 Google 翻译提供支持**：内置 Google 翻译引擎作为备选或快速浏览方案。
- **便捷管理**：新增 **侧边栏账户视图**，一键管理登录状态、缓存和设置。
- **灵活认证**：支持 **匿名模式 (Guest)** 和 **OAuth2 安全登录**。
  - *注：已移除不稳定的 Cookie 认证方式。*
- **智能防风控**：内置令牌桶限流器和智能缓存系统，降低 API 封禁风险。
- **深度浏览**：支持 Reddit 嵌套评论的树状展示，清晰还原讨论脉络。

## 🚀 快速开始

### 1. 准备工作
前往 [Google AI Studio](https://aistudio.google.com/) 免费获取 **Gemini API Key**。这是翻译功能的核心。

### 2. 配置扩展
打开 VS Code 设置 (`Ctrl+,`)，搜索 `logViewer`：
*   **Log Viewer: Gemini Api Key**: 填入你的 Key (必填)。
*   **Log Viewer: Subreddits**: 添加你想看的版块，如 `programming`, `technology` (默认已预设)。

### 3. 选择认证方式

为了获得最佳体验（访问 NSFW 内容、查看个性化订阅），推荐登录。

#### 方式 A: 匿名/游客模式 (默认)
*   **优点**: 无需配置，即装即用。
*   **缺点**: 无法查看 NSFW 内容，API 速率限制较严。
*   **操作**: 默认开启。可在侧边栏“账户信息”中一键切换。

#### 方式 B: OAuth2 登录 (推荐)
*   **优点**: 安全，速率限制更宽松，支持个性化首页。
*   **操作**:
    1. 前往 [Reddit Apps](https://www.reddit.com/prefs/apps) 创建一个应用。
    2. 类型选择 **installed app**。
    3. `redirect uri` 填写 `http://localhost:54321/callback`。
    4. 创建后，将获得一个 **Client ID** (应用名称下方的字符串)。
    5. 在 VS Code 设置中填入 `Log Viewer > Auth: Client Id`。
    6. 点击侧边栏“账户信息”中的 **登录 (OAuth2)** 按钮，并在浏览器中授权。

## 🖥️ 界面指南

### 侧边栏：账户信息 (Account Info)
新的侧边栏视图，提供便捷的控制面板：
- **用户状态**：显示当前是「游客」还是「已认证用户」。
- **快捷操作**：
  - **登录/登出**：一键管理 OAuth 状态。
  - **匿名模式切换**：快速切换身份。
  - **清除缓存**：遇到内容问题时，点此重置。
  - **设置**：快速直达扩展设置页。

## ⚙️ 详细配置

| 配置项 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `logViewer.geminiApiKey` | Gemini API 密钥 (必填) | `""` |
| `logViewer.subreddits` | 订阅列表 | `["programming"]` |
| `logViewer.translationProvider` | 翻译引擎: `machine` (Google/Proxy) 或 `ai` (Gemini) | `machine` |
| `logViewer.geminiModel` | Gemini 模型版本 | `gemini-2.5-flash-lite` |
| `logViewer.auth.clientId` | OAuth2 Client ID (用于登录) | `""` |
| `logViewer.auth.anonymous` | 是否强制开启匿名模式 | `false` |
| `logViewer.cacheDuration` | 内容缓存时长（分钟） | `30` |
| `logViewer.wordWrapWidth` | 硬换行宽度 (字符) | `80` |

## 🛠️ 常用命令

按 `F1` 输入 `Log Viewer`：

- **刷新日志** (`Refresh Logs`): 刷新当前列表。
- **登录 (OAuth2)** (`Login`): 启动 OAuth2 授权流程。
- **切换匿名模式**: 在登录和游客状态间快速切换。
- **清除缓存**: 删除所有已下载的翻译缓存。
- **刷新账户状态**: 手动刷新侧边栏状态。

## 📝 常见问题

**Q: 为什么翻译很慢？**
A: 首次加载帖子需要调用 AI 或翻译接口，通常需要 2-5 秒。内容会自动缓存，再次打开即秒开。

**Q: 登录后无法回调 (Localhost refused)？**
A: 确保你的 Reddit App Redirect URI 严格设置为 `http://localhost:54321/callback`。

**Q: 如何看 NSFW 内容？**
A: 必须使用 **OAuth2 登录**，并且在 Reddit 网页端设置中开启 "I am over 18"。

## 🏗️ 技术架构 (2.0 重构版)

本项目遵循 **Clean Architecture** 原则进行设计：

*   **Domain Layer**: 定义核心业务实体 (`RedditPost`) 和接口 (`IRedditClient`, `ITranslationService`)，不依赖任何外部框架。
*   **Infrastructure Layer**: 
    *   `RedditClient`: 实现 API 调用，支持 OAuth2/匿名双模。
    *   `Translator`: 采用**策略模式**，动态切换 Gemini AI 或 Google 翻译引擎。
*   **Presentation Layer**: 
    *   `LogPresenter`: 专注处理日志格式化与渲染 (View Logic)。
    *   `AccountProvider`: 管理侧边栏账户视图状态。
    *   `Providers`: 适配 VS Code API。
