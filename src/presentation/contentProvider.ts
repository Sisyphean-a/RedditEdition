import * as vscode from "vscode";
import { IRedditClient, ITranslationService, RedditPost, TranslatedPost } from "@/domain";
import { CacheManager } from "@/infrastructure/utils/cache";
import { Config } from "@/infrastructure/utils/config";
import { LogPresenter } from "./logPresenter";

export class LogContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private client: IRedditClient,
    private translator: ITranslationService,
    private cache: CacheManager,
    private presenter: LogPresenter,
    private config: Config,
  ) {
    this.updateTranslator();
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const pathParts = uri.path.split("/");
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

      // Trigger background detailed translation
      this.triggerBackgroundTranslation(uri, post, comments as any[]); // TODO: Fix Model types match

      // Return fast translation immediately
      const translated = await this.translator.translatePostFast(
        post,
        comments as any[],
      );
      const provider = this.translator.getProviderName();
      return this.presenter.render(post, translated, provider + " (Fast)");
    } catch (e) {
      return `[ERROR] 0x0001 数据解码失败 | 时间戳: ${Date.now()}\n[TRACE] 模块: ContentDecoder | 状态: FAILED\n[DETAILS] ${e}`;
    }
  }

  private async triggerBackgroundTranslation(
    uri: vscode.Uri,
    post: RedditPost,
    comments: any[],
  ) {
    try {
      await this.translator.translatePostStream(post, comments, (progress) => {
        const provider = this.translator.getProviderName();
        const content = this.presenter.render(post, progress.translated, provider);
        this.cache.set(`trans:${post.id}`, content);
        this._onDidChange.fire(uri);
      });
    } catch (e) {
      console.error("Background translation failed", e);
    }
  }

  update(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }

  loadMoreComments(uri: vscode.Uri) {
    // Logic to fetch more and update
  }

  updateConfig(config: Config) {
    this.config = config;
    this.presenter.updateConfig(config.wordWrapWidth);
    this.updateTranslator();
  }

  private updateTranslator() {
    let apiKey = '';
    let model = '';
    
    switch (this.config.translationProvider) {

      case 'deepseek':
        apiKey = this.config.deepseekApiKey;
        model = this.config.deepseekModel;
        break;
      case 'openrouter':
        apiKey = this.config.openRouterApiKey;
        model = this.config.openRouterModel;
        break;
    }

    this.translator.updateConfig(apiKey, model, this.config.translationProvider);
  }
}
