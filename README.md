# VS Code Stealth Reader (Reddit Edition)

这是一个伪装成日志查看器的 Reddit 阅读扩展。它将 Reddit 的内容拉取并使用 Google Gemini 翻译成中文，以系统日志的形式展示，让你在工作时“隐蔽”地浏览 Reddit。

## ✨ 特性

- **隐蔽阅读**：UI 伪装成文件树和日志文件，完全禁用 Webview，外观与普通服务器日志无异。
- **全中文体验**：利用 Gemini 2.0 Flash 模型，将所有帖子标题、正文及评论翻译为地道的中文。
- **智能防风控**：内置令牌桶限流器（请求间隔 >2秒）和智能缓存系统，降低 API 封禁风险。
- **层级评论**：支持 Reddit 嵌套评论的树状展示，清晰还原讨论脉络。

## 🚀 快速开始

### 1. 获取 Gemini API Key

前往 [Google AI Studio](https://aistudio.google.com/) 免费获取 API Key。

### 2. 配置扩展

安装插件后，打开 VS Code 设置（`Ctrl+,`），搜索 `logViewer` 进行配置：

- **Log Viewer: Gemini Api Key**: 填入你的 Gemini API Key（必须）。
- **Log Viewer: Subreddits**: 添加你想订阅的 Subreddit 名称（如 `programming`, `technology`）。
- **Log Viewer: Reddit Cookie** (可选): 如果需要访问 NSFW 内容或个别受限社区，需填入你的 Reddit Cookie。

### 3. 开始摸鱼

1.  点击活动栏（Activity Bar）上的 **Log Viewer** 图标（通常在侧边栏最下方，图标是一个输出框）。
2.  展开左侧的 Subreddit 文件夹。
3.  点击帖子（显示为 `.log` 文件），右侧编辑器将自动打开并显示翻译好的内容。

## ⚙️ 详细配置

| 配置项                    | 说明                                   | 默认值                  |
| :------------------------ | :------------------------------------- | :---------------------- |
| `logViewer.geminiApiKey`  | Google Gemini API 密钥，用于翻译服务。 | `""`                    |
| `logViewer.subreddits`    | 订阅的 Subreddit 列表。                | `["programming"]`       |
| `logViewer.redditCookie`  | 用于 Reddit 认证的 Cookie 字符串。     | `""`                    |
| `logViewer.geminiModel`   | 使用的 Gemini 模型版本。               | `gemini-2.5-flash-lite` |
| `logViewer.cacheDuration` | 内容缓存时长（分钟）。                 | `30`                    |
| `logViewer.wordWrapWidth` | 生成日志文件时的硬换行宽度。           | `80`                    |

## 🛠️ 命令

按 `F1` 或 `Ctrl+Shift+P` 打开命令面板，输入 `Log Viewer`：

- **Log Viewer: 刷新日志** (`Refresh Logs`): 刷新当前选中板块的帖子列表。
- **Log Viewer: 刷新所有日志** (`Refresh All Logs`): 刷新所有订阅板块。
- **Log Viewer: 清除缓存** (`Clear Cache`): 清除所有已下载的帖子和翻译缓存。
- **Log Viewer: 设置** (`Open Settings`): 快速打开扩展设置页面。

## 📝 注意事项

- 本插件依赖 Google Gemini 进行翻译，请确保你的网络环境可以连接到 Google API。
- 首次加载帖子时需要进行翻译，耗时可能在 3-10 秒左右，请耐心等待。
- 为了模拟真实日志，所有内容均为纯文本渲染，不支持图片显示（图片往往会导致摸鱼暴露）。
