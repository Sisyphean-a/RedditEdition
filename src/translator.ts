import { GoogleGenerativeAI } from "@google/generative-ai";
import { RedditPost, RedditComment } from "./redditClient";
import { Logger } from "./logger";
import axios from "axios";

export interface TranslatedPost {
  title: string;
  selftext: string;
  comments: TranslatedComment[];
}

export interface TranslatedComment {
  author: string;
  body: string;
  replies: TranslatedComment[];
}

export class Translator {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async translatePost(
    post: RedditPost,
    comments: RedditComment[],
  ): Promise<TranslatedPost> {
    // 1. 如果没有 API Key，直接使用保底逻辑
    if (!this.apiKey) {
      Logger.log("No API Key configured, using fallback translation directly.");
      return this.runFallbackStrategy(post, comments);
    }

    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    // Prepare a simplified structure for translation
    const payload = {
      title: post.title,
      selftext: post.selftext,
      comments: comments.slice(0, 10).map((c) => this.simplifyComment(c, 0, 3)), // Limit top level and depth
    };

    const prompt = `
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
    
    原文：
    ${JSON.stringify(payload)}
    `;

    try {
      Logger.log(
        `Starting translation for post: ${post.id} using model ${this.modelName}`,
      );

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      Logger.log(`Translation response received (length: ${text.length})`);

      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();

      try {
        const parsed = JSON.parse(jsonStr) as TranslatedPost;
        Logger.log("Translation parsed successfully");
        return parsed;
      } catch (parseError) {
        Logger.error("Failed to parse (JSON) translation response", parseError);
        throw new Error("JSON Parse Error");
      }
    } catch (error: any) {
      Logger.error(
        `Gemini translation failed: ${error.message}. Switching to fallback...`,
      );
      return this.runFallbackStrategy(post, comments);
    }
  }

  async translateTitles(titles: string[]): Promise<string[]> {
    if (!this.apiKey || titles.length === 0) return titles;

    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    const prompt = `
      Translate the following Reddit titles to Chinese (Simplified).
      Maintain the original meaning but make it natural.
      Return ONLY a JSON array of strings.
      
      Titles:
      ${JSON.stringify(titles)}
      `;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonStr) as string[];
      // Validate length
      if (Array.isArray(parsed) && parsed.length === titles.length) {
        return parsed;
      }
      return titles;
    } catch (e) {
      Logger.error("Failed to translate titles via Gemini", e);
      // Fallback to original titles if Gemini fails
      return titles;
    }
  }

  // 快速翻译模式：直接返回原文，作为占位，等待后台精细翻译
  async translatePostFast(
    post: RedditPost,
    comments: RedditComment[],
  ): Promise<TranslatedPost> {
    const mapComments = (cmts: RedditComment[]): TranslatedComment[] => {
      return cmts.map((c) => ({
        author: c.author,
        body: c.body,
        replies: c.replies ? mapComments(c.replies) : [],
      }));
    };

    return {
      title: post.title,
      selftext: post.selftext,
      comments: mapComments(comments),
    };
  }

  // 保底策略：逐个字段使用 HTTP 接口翻译
  private async runFallbackStrategy(
    post: RedditPost,
    comments: RedditComment[],
  ): Promise<TranslatedPost> {
    Logger.log("Running fallback strategy...");
    try {
      const [title, selftext] = await Promise.all([
        this.fallbackTranslate(post.title),
        this.fallbackTranslate(post.selftext, 1000), // 截断正文以防 URL 过长
      ]);

      // 仅翻译前 5 条顶级评论，不翻译嵌套，以减少请求数
      const translatedComments: TranslatedComment[] = [];
      for (const c of comments.slice(0, 5)) {
        const body = await this.fallbackTranslate(c.body, 500);
        translatedComments.push({
          author: c.author,
          body: body,
          replies: [], // 保底模式下忽略嵌套评论
        });
      }

      return {
        title: title || post.title,
        selftext: selftext
          ? selftext + "\n\n(提示：内容已截断并使用备用线路翻译)"
          : post.selftext,
        comments: translatedComments,
      };
    } catch (err) {
      Logger.error("Fallback strategy completely failed", err);
      return {
        title: post.title + " (翻译服务全线不可用)",
        selftext: post.selftext,
        comments: [],
      };
    }
  }

  // 单文本翻译
  private async fallbackTranslate(
    text: string,
    maxLength?: number,
  ): Promise<string> {
    if (!text) return "";
    if (maxLength && text.length > maxLength) {
      text = text.substring(0, maxLength) + "...";
    }

    // 简单清理换行符，避免 URL 编码问题
    const q = encodeURIComponent(text.replace(/\r?\n/g, " "));
    const url = `https://fanyi.sisyphean.top/single?client=gtx&sl=auto&tl=zh_CN&dt=t&q=${q}`;

    try {
      const res = await axios.get(url, { timeout: 10000 }); // 10秒超时
      if (res.data && res.data.translation) {
        return res.data.translation;
      }
      return text;
    } catch (error) {
      // 静默失败，返回原文
      return text;
    }
  }

  private simplifyComment(
    comment: RedditComment,
    depth: number,
    maxDepth: number,
  ): any {
    if (depth >= maxDepth) return null;

    const simplified: any = {
      author: comment.author,
      body: comment.body,
    };

    if (comment.replies && comment.replies.length > 0) {
      const replies = comment.replies
        .map((r) => this.simplifyComment(r, depth + 1, maxDepth))
        .filter((r) => r !== null);
      if (replies.length > 0) {
        simplified.replies = replies;
      }
    }
    return simplified;
  }
}
