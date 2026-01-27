import * as vscode from 'vscode';
import { RedditClient } from './redditClient';
import { Translator } from './translator';
import { CacheManager } from './cache';

export class LogContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private client: RedditClient,
    private translator: Translator,
    private cache: CacheManager
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    // uri: stealth-log:/r/{subreddit}/{postId}.log
    const pathParts = uri.path.split('/');
    // path might be /r/subreddit/postId.log
    // parts: ["", "r", "subreddit", "postId.log"]
    if (pathParts.length < 4) {
        return "Invalid log path.";
    }
    
    const subreddit = pathParts[2];
    const filename = pathParts[3];
    const postId = filename.replace('.log', '');

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
      const timestamp = new Date(original.created_utc * 1000).toLocaleString('zh-CN');
      
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
        log += this.formatComments(translated.comments, 0);
    }

    log += `
--------------------------------------------------------------------------------
[DEBUG] 已加载评论 | END OF LOG
--------------------------------------------------------------------------------
`;
      return log;
  }

  private formatComments(comments: any[], depth: number): string {
      let output = "";
      const indent = "       ".repeat(depth);
      
      comments.forEach((comment: any, index: number) => {
          const id = depth === 0 ? `[#${String(index + 1).padStart(3, '0')}]` : `├─ [#${index + 1}]`;
          const prefix = depth === 0 ? "" : indent;
          
          output += `\n${prefix}${id} ${comment.author}\n${prefix}       ${comment.body.replace(/\n/g, `\n${prefix}       `)}\n`;
          
          if (comment.replies && comment.replies.length > 0) {
              output += `       ${prefix}│\n`;
              output += this.formatComments(comment.replies, depth + 1);
          }
      });
      
      return output;
  }

  update(uri: vscode.Uri) {
      this._onDidChange.fire(uri);
  }
  
  // Method to support loadMoreComments if we were to implement it fully commands
  loadMoreComments(uri: vscode.Uri) {
      // Logic to fetch more and update
  }
}
