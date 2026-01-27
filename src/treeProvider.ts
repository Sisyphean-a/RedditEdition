import * as vscode from "vscode";
import { RedditClient, RedditPost } from "./redditClient";
import { Translator, TranslatedPost } from "./translator";
import { CacheManager } from "./cache";
import { Config } from "./config";

type TreeNode = SubredditNode | PostNode | LoadMoreNode;

interface SubredditNode {
  type: "subreddit";
  name: string;
}

interface PostNode {
  type: "post";
  id: string;
  subreddit: string;
  title: string;
  post: RedditPost;
}

interface LoadMoreNode {
  type: "loadMore";
  subreddit: string;
}

export class RedditTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined> =
    new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> =
    this._onDidChangeTreeData.event;

  private subreddits: Map<
    string,
    {
      posts: RedditPost[];
      after: string | null;
    }
  > = new Map();

  constructor(
    private client: RedditClient,
    private translator: Translator,
    private cache: CacheManager,
    private config: Config,
  ) {}

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === "subreddit") {
      const item = new vscode.TreeItem(
        element.name,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = "subreddit";
      return item;
    } else if (element.type === "loadMore") {
      const item = new vscode.TreeItem(
        "加载更多...",
        vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = new vscode.ThemeIcon("ellipsis");
      item.command = {
        command: "logViewer.loadMorePosts",
        title: "Load More",
        arguments: [element],
      };
      item.contextValue = "loadMore";
      return item;
    } else {
      // PostNode
      // We might want to use translated title here if available, or just original title as filename
      // To keep it stealthy, maybe truncate or use ID?
      // Design doc says: "title: string; // 翻译后的中文标题"
      // But we don't have translation yet for the LIST.
      // Translating the whole list might be slow/expensive on tokens.
      // Let's use the english title but maybe truncated, or check if we can get a quick translation.
      // For now, let's use the English title but add a .log extension to look like a file.
      // ACTUALLY, design doc says: "title: string; // 翻译后的中文标题"
      // If we want Chinese titles in the tree, we need to translate them.
      // Let's stick to English title + .log for now to save tokens and speed up list loading,
      // OR maybe valid strategy is to just show ID or "Log-{timestamp}.log" for maximum stealth?
      // Design Doc section 5.6 says "title: string; // 翻译后的中文标题".
      // But FetchSubreddit only returns posts. Translator is used later.
      // Wait, treeProvider has access to translator.
      // Realistically, translating 25 titles sequentially or parallel is heavy.
      // Let's compromise: Use English title for now, it looks like a log file description.
      // Or better: "server-log-{id}.log" and put title in tooltip?
      // No, user wants to read. English title is riskier but readable.
      // Let's use English title for now.

      const label = `[LOG] ${element.title}`;
      const item = new vscode.TreeItem(
        label,
        vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = vscode.ThemeIcon.File;
      item.command = {
        command: "vscode.open",
        title: "Open Log",
        arguments: [
          vscode.Uri.parse(
            `stealth-log:/r/${element.subreddit}/${element.id}.log`,
          ),
        ],
      };
      item.tooltip = element.title;
      return item;
    }
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      return this.config.subreddits.map((name) => ({
        type: "subreddit",
        name,
      }));
    }

    if (element.type === "subreddit") {
      let data = this.subreddits.get(element.name);

      if (!data) {
        // Check cache first?
        // For list, we might not cache complexity to keep it fresh.
        // Let's fetch.
        try {
          const result = await this.client.fetchSubreddit(element.name);
          data = { posts: result.posts, after: result.after };
          this.subreddits.set(element.name, data);
        } catch (e) {
          vscode.window.showErrorMessage(`Failed to load logs: ${e}`);
          return [];
        }
      }

      // Try to get cached translations FIRST
      const cachedTitles: string[] | undefined = (data as any).translatedTitles;
      let displayTitles = cachedTitles || data.posts.map((p) => p.title);

      // If no cache, trigger async translation
      if (!cachedTitles) {
        this.translator
          .translateTitles(data.posts.map((p) => p.title))
          .then((translated) => {
            if (data) {
              (data as any).translatedTitles = translated;
              // Trigger refresh to show Chinese titles
              this._onDidChangeTreeData.fire(element);
            }
          })
          .catch((e) => {
            console.error("Async translation failed", e);
          });
      }

      const nodes: TreeNode[] = data.posts.map((post, index) => ({
        type: "post",
        id: post.id,
        subreddit: element.name,
        title: displayTitles[index] || post.title,
        post: post,
      }));

      if (data.after) {
        nodes.push({ type: "loadMore", subreddit: element.name });
      }

      return nodes;
    }

    return [];
  }

  async refresh(subreddit?: string) {
    if (subreddit) {
      this.subreddits.delete(subreddit);
      // We could also clear cache for specific items if we tracked them
    } else {
      this.subreddits.clear();
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  async loadMorePosts(subreddit: string) {
    const data = this.subreddits.get(subreddit);
    if (!data || !data.after) return;

    try {
      const result = await this.client.fetchSubreddit(subreddit, data.after);
      data.posts.push(...result.posts);
      data.after = result.after;
      this._onDidChangeTreeData.fire(undefined);
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to load more logs: ${e}`);
    }
  }

  updateConfig(config: Config) {
    this.config = config;
    this.refresh();
  }
}
