import { RedditPost, RedditComment, TranslatedPost, TranslationProgress } from "@/domain";
import { Logger } from "@/infrastructure/utils/logger";
import axios from "axios";

export interface ITranslationStrategy {
  translatePost(post: RedditPost, comments: RedditComment[], onUsage?: (tokens: number) => void): Promise<TranslatedPost>;
  translatePostStream?(
    post: RedditPost,
    comments: RedditComment[],
    onProgress: (progress: TranslationProgress) => void,
    onUsage?: (tokens: number) => void
  ): Promise<TranslatedPost>;
  translateTitles(titles: string[]): Promise<string[]>;
}

// ============================================
// Abstract Base Class for AI Translation Strategies
// ============================================
export abstract class BaseAITranslationStrategy implements ITranslationStrategy {
  protected abstract readonly baseUrl: string;

  constructor(protected apiKey: string, protected modelName: string) {}

  // ----------------------------------------
  // Common: Build Translation Prompt
  // ----------------------------------------
  protected buildTranslationPrompt(post: RedditPost, comments: RedditComment[]): string {
    const payload = {
      title: post.title,
      selftext: post.selftext,
      comments: comments.slice(0, 10).map((c) => this.simplifyComment(c, 0, 3)),
    };

    return `
    将以下 Reddit 帖子翻译成中文，保持口语化风格。
    只返回 JSON，格式如下：
    {
      "title": "翻译后的标题",
      "selftext": "翻译后的正文",
      "comments": [
        {
          "author": "保留原作者名",
          "body": "翻译后的评论",
          "replies": [...]
        }
      ]
    }
    
    不用返回 Markdown 代码块标记，直接返回 JSON 字符串。
    
    原文：
    ${JSON.stringify(payload)}
    `;
  }

  // ----------------------------------------
  // Common: Build Titles Translation Prompt
  // ----------------------------------------
  protected buildTitlesPrompt(titles: string[]): string {
    return `
      Translate the following Reddit titles to Chinese (Simplified).
      Return a JSON object with a 'titles' key containing the array of strings.
      Example: { "titles": ["Title 1 CN", "Title 2 CN"] }
      
      Titles: ${JSON.stringify(titles)}
      `;
  }

  // ----------------------------------------
  // Common: Simplify Comment Structure
  // ----------------------------------------
  protected simplifyComment(comment: RedditComment, depth: number, maxDepth: number): any {
    if (depth >= maxDepth) return null;
    const simplified: any = { author: comment.author, body: comment.body };
    if (comment.replies && comment.replies.length > 0) {
      const replies = comment.replies
        .map((r) => this.simplifyComment(r, depth + 1, maxDepth))
        .filter((r) => r !== null);
      if (replies.length > 0) simplified.replies = replies;
    }
    return simplified;
  }

  // ----------------------------------------
  // Common: Clean Markdown Code Blocks from Response
  // ----------------------------------------
  protected cleanResponseContent(content: string): string {
    return content.replace(/```json\n?|\n?```/g, "").trim();
  }

  // ----------------------------------------
  // Abstract: Build Request Headers
  // ----------------------------------------
  protected abstract buildHeaders(): Record<string, string>;

  // ----------------------------------------
  // Abstract: Build Request Body
  // ----------------------------------------
  protected abstract buildRequestBody(prompt: string): unknown;

  // ----------------------------------------
  // Abstract: Extract Usage from Response
  // ----------------------------------------
  protected abstract extractUsage(responseData: unknown): number | undefined;

  // ----------------------------------------
  // Abstract: Extract Content from Response
  // ----------------------------------------
  protected abstract extractContent(responseData: unknown): string;

  // ----------------------------------------
  // Common: Make API Call
  // ----------------------------------------
  protected async callAPI(prompt: string, timeout: number = 60000): Promise<unknown> {
    const response = await axios.post(
      this.baseUrl,
      this.buildRequestBody(prompt),
      {
        headers: this.buildHeaders(),
        timeout: timeout,
      }
    );
    return response.data;
  }

  // ----------------------------------------
  // ITranslationStrategy Implementation
  // ----------------------------------------
  async translatePost(
    post: RedditPost,
    comments: RedditComment[],
    onUsage?: (tokens: number) => void
  ): Promise<TranslatedPost> {
    const prompt = this.buildTranslationPrompt(post, comments);

    try {
      const data = await this.callAPI(prompt, 60000);

      // Track usage
      const usage = this.extractUsage(data);
      if (onUsage && usage) {
        onUsage(usage);
      }

      const content = this.extractContent(data);
      return JSON.parse(content) as TranslatedPost;
    } catch (error: any) {
      Logger.error(`${this.constructor.name} translation failed: ${error.message}`);
      throw error;
    }
  }

  async translatePostStream(
    post: RedditPost,
    comments: RedditComment[],
    onProgress: (progress: TranslationProgress) => void,
    onUsage?: (tokens: number) => void
  ): Promise<TranslatedPost> {
    const prompt = this.buildTranslationPrompt(post, comments);

    try {
      const data = await this.callAPI(prompt, 120000);

      // Track usage
      const usage = this.extractUsage(data);
      if (onUsage && usage) {
        onUsage(usage);
      }

      const content = this.cleanResponseContent(this.extractContent(data));

      try {
        const parsed = JSON.parse(content) as TranslatedPost;

        // Notify completion
        onProgress({
          translated: parsed,
          stage: "comment",
          commentIndex: parsed.comments?.length || 0,
          total: parsed.comments?.length || 0,
        });

        return parsed;
      } catch (e) {
        Logger.error(`${this.constructor.name} JSON parse failed`, e);
        throw e;
      }
    } catch (error: any) {
      Logger.error(`${this.constructor.name} translation failed: ${error.message}`);
      throw error;
    }
  }

  async translateTitles(titles: string[]): Promise<string[]> {
    const prompt = this.buildTitlesPrompt(titles);

    try {
      const data = await this.callAPI(prompt, 30000);
      const content = this.cleanResponseContent(this.extractContent(data));
      const result = JSON.parse(content);
      return result.titles || [];
    } catch (e) {
      throw e;
    }
  }
}

// ============================================
// DeepSeek Strategy
// ============================================
export class DeepSeekStrategy extends BaseAITranslationStrategy {
  protected readonly baseUrl = "https://api.deepseek.com/chat/completions";

  protected buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  protected buildRequestBody(prompt: string): unknown {
    return {
      model: this.modelName,
      messages: [
        { role: "system", content: "You are a helpful assistant. Please output JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    };
  }

  protected extractUsage(responseData: any): number | undefined {
    return responseData.usage?.total_tokens;
  }

  protected extractContent(responseData: any): string {
    return responseData.choices?.[0]?.message?.content || "{}";
  }
}

// ============================================
// OpenRouter Strategy
// ============================================
export class OpenRouterStrategy extends BaseAITranslationStrategy {
  protected readonly baseUrl = "https://openrouter.ai/api/v1/chat/completions";

  protected buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  protected buildRequestBody(prompt: string): unknown {
    return {
      model: this.modelName,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    };
  }

  protected extractUsage(responseData: any): number | undefined {
    return responseData.usage?.total_tokens;
  }

  protected extractContent(responseData: any): string {
    const content = responseData.choices?.[0]?.message?.content || "{}";
    return this.cleanResponseContent(content);
  }
}

// ============================================
// Machine Translation Strategy (Google Translate)
// ============================================
export class MachineStrategy implements ITranslationStrategy {
  async translatePost(
    post: RedditPost,
    comments: RedditComment[],
    onUsage?: (tokens: number) => void
  ): Promise<TranslatedPost> {
    const [title, selftext] = await Promise.all([
      this.translateText(post.title),
      this.translateText(post.selftext, 5000),
    ]);

    const translatedComments: import("@/domain").TranslatedComment[] = [];
    for (const c of comments.slice(0, 10)) {
      const body = await this.translateText(c.body, 3000);
      translatedComments.push({
        author: c.author,
        body: body,
        replies: [],
      });
    }

    return {
      title: title || post.title,
      selftext: selftext || post.selftext,
      comments: translatedComments,
    };
  }

  async translatePostStream(
    post: RedditPost,
    comments: RedditComment[],
    onProgress: (progress: TranslationProgress) => void,
    onUsage?: (tokens: number) => void
  ): Promise<TranslatedPost> {
    const result: TranslatedPost = {
      title: post.title,
      selftext: post.selftext,
      comments: comments.slice(0, 10).map((c) => ({
        author: c.author,
        body: c.body,
        replies: [],
      })),
    };
    const total = comments.slice(0, 10).length;

    // 翻译标题
    result.title = await this.translateText(post.title);
    onProgress({ translated: { ...result }, stage: "title" });

    // 翻译正文
    result.selftext = await this.translateText(post.selftext, 5000);
    onProgress({ translated: { ...result }, stage: "selftext" });

    // 逐条翻译评论
    for (let i = 0; i < result.comments.length; i++) {
      const c = comments[i];
      result.comments[i].body = await this.translateText(c.body, 3000);
      onProgress({
        translated: { ...result, comments: [...result.comments] },
        stage: "comment",
        commentIndex: i,
        total,
      });
    }

    return result;
  }

  async translateTitles(titles: string[]): Promise<string[]> {
    return Promise.all(titles.map((t) => this.translateText(t)));
  }

  private async translateText(text: string, maxLength?: number): Promise<string> {
    if (!text || !text.trim()) return "";
    if (maxLength && text.length > maxLength) text = text.substring(0, maxLength) + "...";

    try {
      return await this.translateGoogle(text);
    } catch {
      try {
        return await this.translateProxy(text);
      } catch {
        return text;
      }
    }
  }

  private async translateGoogle(text: string): Promise<string> {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&ie=UTF-8&dj=1&q=" +
      encodeURIComponent(text);
    const res = await axios.get(url, { timeout: 5000 });
    return res.data.sentences.map((s: any) => s.trans || "").join("");
  }

  private async translateProxy(text: string): Promise<string> {
    const q = encodeURIComponent(text.replace(/\r?\n/g, " "));
    const url = `https://fanyi.sisyphean.top/single?client=gtx&sl=auto&tl=zh_CN&dt=t&q=${q}`;
    const res = await axios.get(url, { timeout: 10000 });
    return res.data.translation;
  }
}
