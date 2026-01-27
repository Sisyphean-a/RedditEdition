import * as vscode from "vscode";
import { RedditClient } from "./redditClient";
import { Translator } from "./translator";
import { CacheManager } from "./cache";
import { Config } from "./config";

export class LogContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private client: RedditClient,
    private translator: Translator,
    private cache: CacheManager,
    private config: Config,
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    // uri: stealth-log:/r/{subreddit}/{postId}.log
    const pathParts = uri.path.split("/");
    // path might be /r/subreddit/postId.log
    // parts: ["", "r", "subreddit", "postId.log"]
    if (pathParts.length < 4) {
      return "无效的日志路径。";
    }

    const subreddit = pathParts[2];
    const filename = pathParts[3];
    const postId = filename.replace(".log", "");

    const cacheKey = `trans:${postId}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const { post, comments } = await this.client.fetchPost(subreddit, postId);

      // Translate
      const translated = await this.translator.translatePost(post, comments);

      // Format
      const content = this.formatLog(post, translated);

      this.cache.set(cacheKey, content);
      return content;
    } catch (e) {
      return `[ERROR] 0x0001 数据解码失败 | 时间戳: ${Date.now()}\n[TRACE] 模块: ContentDecoder | 状态: FAILED\n[DETAILS] ${e}`;
    }
  }

  private formatLog(original: any, translated: any): string {
    const timestamp = new Date(original.created_utc * 1000).toLocaleString(
      "zh-CN",
    );

    let log = `================================================================================
[SYSTEM LOG] ${timestamp} | PID: ${original.id}
================================================================================

[INFO] 作者: ${original.author} | 评分: ${original.score} | 评论数: ${original.num_comments}
[TITLE] ${translated.title}

[CONTENT]
${translated.selftext || "[无正文内容]"}

================================================================================
[TRACE LOG] 评论区
================================================================================
`;

    if (translated.comments) {
      log += this.formatComments(translated.comments, "", "");
    }

    log += `
--------------------------------------------------------------------------------
[DEBUG] 已加载评论 | END OF LOG
--------------------------------------------------------------------------------
`;
    return log;
  }

  private formatComments(
    comments: any[],
    parentId: string,
    indent: string,
  ): string {
    let output = "";

    comments.forEach((c, i) => {
      const idx = i + 1;
      const currentId = parentId
        ? `${parentId}.${idx}`
        : String(idx).padStart(3, "0");
      const isLast = i === comments.length - 1;

      let header = "";
      let bodyIndent = "";
      let childIndent = "";

      if (!parentId) {
        // Root level
        header = `[#${currentId}] ${c.author}`;
        bodyIndent = "       ";
        childIndent = "       ";
      } else {
        // Nested level
        const branch = isLast ? "└── " : "├── ";
        header = `${indent}${branch}[#${currentId}] ${c.author}`;

        const vertical = isLast ? "    " : "│   ";
        bodyIndent = `${indent}${vertical}`;
        childIndent = `${indent}${vertical}`;
      }

      output += `${header}\n`;

      // Body with hard wrap
      const wrappedLines = this.wordWrap(c.body, this.config.wordWrapWidth);
      for (const line of wrappedLines) {
        if (line.trim()) {
          output += `${bodyIndent}${line}\n`;
        }
      }

      // Recursive Replies
      if (c.replies && c.replies.length > 0) {
        output += this.formatComments(c.replies, currentId, childIndent);
      } else {
        // Add spacer after root comments or non-last blocks for readability
        if (!parentId) output += "\n";
      }
    });
    return output;
  }

  private wordWrap(text: string, maxLength: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split("\n");

    for (const para of paragraphs) {
      if (!para) {
        continue; // Skip empty paragraphs (or handle them if needed)
      }

      let remaining = para;
      while (remaining.length > maxLength) {
        let splitIndex = maxLength;

        // Optimistic wrap: try to find a space near the break point
        // Search backwards from maxLength
        const spaceIndex = remaining.lastIndexOf(" ", maxLength);

        // If space found and it's not too far back (e.g., within last 20 chars), split there
        // This prevents wrapping "I am a develop" | "er" -> "developer" split
        // But for Chinese which has no spaces, this check will fail (spaceIndex = -1 or very old)
        // So, if no space or space is too far, we just hard break (good for Chinese)
        if (spaceIndex > maxLength * 0.7) {
          splitIndex = spaceIndex;
        }

        lines.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trim(); // trim leading space of next line
      }

      if (remaining) {
        lines.push(remaining);
      }
    }
    return lines;
  }

  update(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }

  loadMoreComments(uri: vscode.Uri) {
    // Logic to fetch more and update
  }

  updateConfig(config: Config) {
    this.config = config;
  }
}
