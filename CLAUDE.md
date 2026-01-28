# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

VS Code 扩展，伪装成日志查看器浏览 Reddit，自动翻译为中文。使用虚拟文档 scheme (`stealth-log://`) 渲染内容。

## 常用命令

```bash
npm run compile      # 编译 TypeScript
npm run watch        # 监听模式开发
npm run lint         # ESLint 检查
npm test             # 运行测试
```

## 架构

采用 Clean Architecture：

- **Domain** (`models.ts`, `interfaces.ts`): 核心实体 `RedditPost`/`RedditComment`，接口 `IRedditClient`/`ITranslationService`
- **Infrastructure**:
  - `redditClient.ts`: Reddit API 调用，支持 OAuth2/匿名两种认证
  - `translator.ts` + `translationStrategies.ts`: 策略模式，Gemini AI 或 Google 翻译
  - `oauthManager.ts` + `authServer.ts`: OAuth2 流程，本地回调服务器 (端口 54321)
  - `cache.ts`: VS Code globalState 缓存
  - `rateLimiter.ts`: 令牌桶限流 (2秒间隔)
- **Presentation**:
  - `treeProvider.ts`: TreeView 显示 subreddit 和帖子
  - `accountProvider.ts`: 侧边栏账户信息视图 (登录状态、设置入口)
  - `contentProvider.ts`: 虚拟文档提供者
  - `logPresenter.ts`: 格式化为 ASCII 日志

## 关键设计

1. **异步翻译**: 先显示原文，后台翻译完成后更新缓存
2. **翻译策略**: `GeminiStrategy` (AI) 和 `MachineStrategy` (Google/Proxy 备用)
3. **配置前缀**: 所有设置使用 `logViewer.*`

## 入口点

- `extension.ts`: 扩展激活入口，注册命令和 Provider
- `config.ts`: 读取 VS Code 配置
