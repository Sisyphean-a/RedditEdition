import * as vscode from 'vscode';
import { getConfig } from './config';
import { RateLimiter } from './rateLimiter';
import { CacheManager } from './cache';
import { RedditClient } from './redditClient';
import { Translator } from './translator';
import { RedditTreeProvider } from './treeProvider';
import { LogContentProvider } from './contentProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "log-viewer" is now active!');

  const config = getConfig();

  // Initialize modules
  const limiter = new RateLimiter();
  const cache = new CacheManager(context.globalState, config.cacheDuration);
  const client = new RedditClient(limiter, config.redditCookie);
  const translator = new Translator(config.geminiApiKey);

  // Register Providers
  const treeProvider = new RedditTreeProvider(client, translator, cache, config);
  const contentProvider = new LogContentProvider(client, translator, cache);

  // Register TreeView
  vscode.window.registerTreeDataProvider('logViewer', treeProvider);

  // Register virtual document scheme
  vscode.workspace.registerTextDocumentContentProvider('stealth-log', contentProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('logViewer.refresh', (node) => treeProvider.refresh(node?.name)),
    vscode.commands.registerCommand('logViewer.refreshAll', () => treeProvider.refresh()),
    vscode.commands.registerCommand('logViewer.clearCache', () => cache.clear()),
    vscode.commands.registerCommand('logViewer.loadMorePosts', (node) => treeProvider.loadMorePosts(node.subreddit)),
    vscode.commands.registerCommand('logViewer.loadMoreComments', (uri) => contentProvider.loadMoreComments(uri))
  );
}

export function deactivate() {}
