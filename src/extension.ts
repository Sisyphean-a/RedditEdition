import * as vscode from "vscode";
import { getConfig } from "./config";
import { RateLimiter } from "./rateLimiter";
import { CacheManager } from "./cache";
import { RedditClient } from "./redditClient";
import { Translator } from "./translator";
import { RedditTreeProvider } from "./treeProvider";
import { LogContentProvider } from "./contentProvider";
import { Logger } from "./logger";
import { OAuthManager } from "./oauthManager";
import { LogPresenter } from "./logPresenter";
import { AccountProvider } from "./accountProvider";

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
  const oauthManager = new OAuthManager(context);
  // Try to restore token on activation
  oauthManager.getAccessToken().catch(() => {});
  
  const cache = new CacheManager(context.globalState, config.cacheDuration);
  const client = new RedditClient(
    limiter, 
    oauthManager,
    config.auth.anonymous
  );
  const translator = new Translator(
    config.geminiApiKey,
    config.geminiModel,
    config.translationProvider,
  );
  
  const logPresenter = new LogPresenter(config.wordWrapWidth);

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
    logPresenter,
    config,
  );
  const accountProvider = new AccountProvider(oauthManager, client);

  // Register TreeViews
  vscode.window.registerTreeDataProvider("logViewer", treeProvider);
  vscode.window.registerTreeDataProvider("reddit-account", accountProvider);

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
    vscode.commands.registerCommand("logViewer.login", async () => {
        await oauthManager.login();
        accountProvider.refresh();
        treeProvider.refresh();
    }),
    vscode.commands.registerCommand("logViewer.logout", async () => {
        await oauthManager.logout();
        accountProvider.refresh();
        treeProvider.refresh();
    }),
    vscode.commands.registerCommand("logViewer.toggleAnonymous", async () => {
      const current = getConfig().auth.anonymous;
      await vscode.workspace.getConfiguration('logViewer').update('auth.anonymous', !current, true);
      const newState = !current;
      accountProvider.refresh();
      treeProvider.refresh();
      if (newState) {
        vscode.window.showInformationMessage('已切换到匿名模式 (Anonymous Mode)');
      } else {
        vscode.window.showInformationMessage('已关闭匿名模式');
      }
    }),
    vscode.commands.registerCommand("logViewer.refreshAccount", () =>
      accountProvider.refresh()
    ),
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
        translator.updateConfig(
          newConfig.geminiApiKey,
          newConfig.geminiModel,
          newConfig.translationProvider
        );
        logPresenter.updateConfig(newConfig.wordWrapWidth);

        // If subreddits changed, refresh tree
        if (e.affectsConfiguration("logViewer.subreddits")) {
          treeProvider.refresh();
        }

        if (e.affectsConfiguration("logViewer.auth.anonymous")) {
           client.setAnonymousMode(newConfig.auth.anonymous);
           accountProvider.refresh();
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
