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
  private provider: string;

  constructor(apiKey: string, modelName: string, provider: string = 'machine') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.provider = provider;
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async translatePost(
    post: RedditPost,
    comments: RedditComment[],
  ): Promise<TranslatedPost> {
    
    if (this.provider === 'machine') {
       Logger.log(`Using Machine Translation (Google Priority) for post: ${post.id}`);
       return this.executeMachineTranslation(post, comments);
    }

    // AI Mode
    // 1. 如果没有 API Key，直接使用保底逻辑
    if (!this.apiKey) {
      Logger.log("No API Key configured, using fallback translation directly.");
      return this.executeMachineTranslation(post, comments);
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
      return this.executeMachineTranslation(post, comments);
    }
  }

  async translateTitles(titles: string[]): Promise<string[]> {
    if (this.provider === 'machine') {
        // Machine translation for titles
        // Use Promise.all with some concurrency control if needed, but for 25 items it's usually fine to batch or just run parallel.
        // Let's optimize by running parallel but individually to handle failures.
        const translated = await Promise.all(titles.map(t => this.translateTextMachine(t)));
        return translated;
    }

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
      // Fallback to machine translation if Gemini fails
       const translated = await Promise.all(titles.map(t => this.translateTextMachine(t)));
       return translated;
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

  // 机械翻译执行策略：Google 优先，Proxy 兜底
  private async executeMachineTranslation(
    post: RedditPost,
    comments: RedditComment[],
  ): Promise<TranslatedPost> {
    Logger.log("Executing Machine Translation Strategy...");
    try {
      const [title, selftext] = await Promise.all([
        this.translateTextMachine(post.title),
        this.translateTextMachine(post.selftext, 5000), // Google supports large payloads usually
      ]);

      // 仅翻译前 10 条顶级评论
      const translatedComments: TranslatedComment[] = [];
      for (const c of comments.slice(0, 10)) {
        const body = await this.translateTextMachine(c.body, 3000);
        translatedComments.push({
          author: c.author,
          body: body,
          replies: [], // 机械翻译模式暂不深度递归
        });
      }

      return {
        title: title || post.title,
        selftext: selftext || post.selftext,
        comments: translatedComments,
      };
    } catch (err) {
      Logger.error("Machine translation strategy failed", err);
      return {
        title: post.title + " (翻译失败)",
        selftext: post.selftext,
        comments: [],
      };
    }
  }

   // 统一文本翻译入口
  private async translateTextMachine(
    text: string,
    maxLength?: number,
  ): Promise<string> {
    if (!text || !text.trim()) return "";
    if (maxLength && text.length > maxLength) {
      text = text.substring(0, maxLength) + "...";
    }

    // 1. Try Google Native
    try {
        const googleResult = await this.translateTextGoogle(text);
        if (googleResult) return googleResult;
    } catch (e) {
        // Logger.warn("Google Native Translation failed, trying proxy...", e);
    }

    // 2. Try Proxy (Sisyphean)
    try {
        const proxyResult = await this.translateTextProxy(text);
        if (proxyResult) return proxyResult;
    } catch (e) {
         Logger.error("All translation providers failed for text segment.", e);
    }
    
    // 3. Fallback to original
    return text;
  }

  // Google 原生翻译
  private async translateTextGoogle(text: string): Promise<string> {
     const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&ie=UTF-8&dj=1&q=' + encodeURIComponent(text);
     try {
         const res = await axios.get(url, { timeout: 5000 });
         if (res.data && Array.isArray(res.data.sentences)) {
             return res.data.sentences.map((s: any) => s.trans || '').join('');
         }
         throw new Error("Invalid Google Translate response format");
     } catch (error) {
         throw error;
     }

  }

  // Sisyphean 代理翻译
  private async translateTextProxy(
    text: string
  ): Promise<string> {
    // 简单清理换行符，避免 URL 编码问题
    const q = encodeURIComponent(text.replace(/\r?\n/g, " "));
    const url = `https://fanyi.sisyphean.top/single?client=gtx&sl=auto&tl=zh_CN&dt=t&q=${q}`;

    try {
      const res = await axios.get(url, { timeout: 10000 }); // 10秒超时
      if (res.data && res.data.translation) {
        return res.data.translation;
      }
      throw new Error("Invalid Proxy response");
    } catch (error) {
      throw error;
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
