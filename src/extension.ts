import * as vscode from "vscode";
import { getConfig } from "./config";
import { RateLimiter } from "./rateLimiter";
import { CacheManager } from "./cache";
import { RedditClient } from "./redditClient";
import { Translator } from "./translator";
import { RedditTreeProvider } from "./treeProvider";
import { LogContentProvider } from "./contentProvider";
import { Logger } from "./logger";

export function activate(context: vscode.ExtensionContext) {
  Logger.initialize(context, "Log Viewer Debug");
  Logger.log('Extension "log-viewer" is activating...');

  const config = getConfig();

  if (!config.geminiApiKey) {
    vscode.window.showWarningMessage(
      "未配置 Gemini API Key，翻译功能将不可用。请在设置中配置 `logViewer.geminiApiKey`。",
    );
    Logger.error("Gemini API Key is not configured.");
  }

  // Initialize modules
  const limiter = new RateLimiter();
  const cache = new CacheManager(context.globalState, config.cacheDuration);
  const client = new RedditClient(limiter, config.redditCookie);
  const translator = new Translator(config.geminiApiKey, config.geminiModel);

  // Register Providers
  const treeProvider = new RedditTreeProvider(
    client,
    translator,
    cache,
    config,
  );
  const contentProvider = new LogContentProvider(
    client,
    translator,
    cache,
    config,
  );

  // Register TreeView
  vscode.window.registerTreeDataProvider("logViewer", treeProvider);

  // Register virtual document scheme
  vscode.workspace.registerTextDocumentContentProvider(
    "stealth-log",
    contentProvider,
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("logViewer.refresh", (arg: any) => {
      if (arg instanceof vscode.Uri && arg.scheme === "stealth-log") {
        // Refresh content
        cache.delete(`trans:${arg.path.split("/").pop()?.replace(".log", "")}`);
        contentProvider.update(arg);
      } else {
        // Refresh tree
        treeProvider.refresh(arg?.name);
      }
    }),
    vscode.commands.registerCommand("logViewer.refreshAll", () =>
      treeProvider.refresh(),
    ),
    vscode.commands.registerCommand("logViewer.clearCache", () =>
      cache.clear(),
    ),
    vscode.commands.registerCommand("logViewer.loadMorePosts", (node: any) =>
      treeProvider.loadMorePosts(node.subreddit),
    ),
    vscode.commands.registerCommand("logViewer.loadMoreComments", (uri: any) =>
      contentProvider.loadMoreComments(uri),
    ),
    vscode.commands.registerCommand("logViewer.openSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "logViewer",
      );
    }),
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("logViewer")) {
        Logger.log("Configuration changed, reloading...");
        const newConfig = getConfig();
        // Update components with new config
        treeProvider.updateConfig(newConfig);
        contentProvider.updateConfig(newConfig);

        // If subreddits changed, refresh tree
        if (e.affectsConfiguration("logViewer.subreddits")) {
          treeProvider.refresh();
        }
      }
    }),
  );

  Logger.log("Extension activated successfully.");
}

export function deactivate() {
  Logger.log("Extension deactivated.");
}
