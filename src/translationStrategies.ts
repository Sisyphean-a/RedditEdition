import { RedditPost, RedditComment, TranslatedPost, TranslatedComment } from "./models";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Logger } from "./logger";
import axios from "axios";

export interface ITranslationStrategy {
  translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost>;
  translateTitles(titles: string[]): Promise<string[]>;
}

export class GeminiStrategy implements ITranslationStrategy {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string, private modelName: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    const payload = {
      title: post.title,
      selftext: post.selftext,
      comments: comments.slice(0, 10).map((c) => this.simplifyComment(c, 0, 3)),
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
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonStr) as TranslatedPost;
    } catch (error: any) {
      Logger.error(`Gemini translation failed: ${error.message}`);
      throw error;
    }
  }

  async translateTitles(titles: string[]): Promise<string[]> {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const prompt = `
        Translate the following Reddit titles to Chinese (Simplified).
        Return ONLY a JSON array of strings.
        Titles: ${JSON.stringify(titles)}
        `;
      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(jsonStr) as string[];
      } catch (e) {
          throw e; // Let context handle fallback
      }
  }

  private simplifyComment(comment: RedditComment, depth: number, maxDepth: number): any {
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
}

export class MachineStrategy implements ITranslationStrategy {
    async translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost> {
        const [title, selftext] = await Promise.all([
            this.translateText(post.title),
            this.translateText(post.selftext, 5000),
        ]);

        const translatedComments: TranslatedComment[] = [];
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

    async translateTitles(titles: string[]): Promise<string[]> {
        return Promise.all(titles.map(t => this.translateText(t)));
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
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&ie=UTF-8&dj=1&q=' + encodeURIComponent(text);
        const res = await axios.get(url, { timeout: 5000 });
        return res.data.sentences.map((s: any) => s.trans || '').join('');
    }

    private async translateProxy(text: string): Promise<string> {
        const q = encodeURIComponent(text.replace(/\r?\n/g, " "));
        const url = `https://fanyi.sisyphean.top/single?client=gtx&sl=auto&tl=zh_CN&dt=t&q=${q}`;
        const res = await axios.get(url, { timeout: 10000 });
        return res.data.translation;
    }
}
