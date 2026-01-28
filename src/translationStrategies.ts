import { RedditPost, RedditComment, TranslatedPost, TranslatedComment } from "./models";
import { TranslationProgress } from "./interfaces";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Logger } from "./logger";
import axios from "axios";


export interface ITranslationStrategy {
  translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost>;
  translatePostStream?(
    post: RedditPost,
    comments: RedditComment[],
    onProgress: (progress: TranslationProgress) => void
  ): Promise<TranslatedPost>;
  translateTitles(titles: string[]): Promise<string[]>;
}

export class DeepSeekStrategy implements ITranslationStrategy {
  private readonly baseUrl = 'https://api.deepseek.com/chat/completions';

  constructor(private apiKey: string, private modelName: string) {}

  async translatePostStream(
    post: RedditPost,
    comments: RedditComment[],
    onProgress: (progress: TranslationProgress) => void
  ): Promise<TranslatedPost> {
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
    
    不用返回 Markdown 代码块标记，直接返回 JSON 字符串。
    
    原文：
    ${JSON.stringify(payload)}
    `;

    try {
        const response = await axios.post(
            this.baseUrl,
            {
                model: this.modelName,
                messages: [
                    { role: "system", content: "You are a helpful assistant. Please output JSON." },
                    { role: "user", content: prompt }
                ],
                stream: false,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 120000 // Stream/Long request needs more time
            }
        );

        const contentRaw = response.data.choices?.[0]?.message?.content || "{}";
        const content = contentRaw.replace(/```json\n?|\n?```/g, "").trim();

        try {
            const parsed = JSON.parse(content) as TranslatedPost;
            
            // Notify completion
            onProgress({
                translated: parsed,
                stage: 'comment',
                commentIndex: parsed.comments?.length || 0,
                total: parsed.comments?.length || 0
            });

            return parsed;
        } catch (e) { 
             Logger.error("DeepSeek JSON parse failed", e);
             throw e;
        }

    } catch (error: any) {
        Logger.error(`DeepSeek translation failed: ${error.message}`);
        throw error;
    }
  }

  async translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost> {
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
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.modelName,
          messages: [
            { role: "system", content: "You are a helpful assistant. Please output JSON." },
            { role: "user", content: prompt }
          ],
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 60000 // 60s timeout
        }
      );

      const content = response.data.choices?.[0]?.message?.content || "{}";
      return JSON.parse(content) as TranslatedPost;
    } catch (error: any) {
        Logger.error(`DeepSeek translation failed: ${error.message}`);
        throw error;
    }
  }

  async translateTitles(titles: string[]): Promise<string[]> {
      const prompt = `
        Translate the following Reddit titles to Chinese (Simplified).
        Return a JSON object with a 'titles' key containing the array of strings.
        Example: { "titles": ["Title 1 CN", "Title 2 CN"] }
        
        Titles: ${JSON.stringify(titles)}
        `;
      try {
        const response = await axios.post(
            this.baseUrl,
            {
                model: this.modelName,
                messages: [
                    { role: "system", content: "You are a helpful assistant. Please output JSON." }, 
                    { role: "user", content: prompt }
                ],
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 30000
            }
        );
        const content = response.data.choices?.[0]?.message?.content || "{}";
        const result = JSON.parse(content);
        return result.titles || [];
      } catch (e) {
          throw e; 
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

    async translatePostStream(
        post: RedditPost,
        comments: RedditComment[],
        onProgress: (progress: TranslationProgress) => void
    ): Promise<TranslatedPost> {
        const result: TranslatedPost = {
            title: post.title,
            selftext: post.selftext,
            comments: comments.slice(0, 10).map(c => ({
                author: c.author,
                body: c.body,
                replies: [],
            })),
        };
        const total = comments.slice(0, 10).length;

        // 翻译标题
        result.title = await this.translateText(post.title);
        onProgress({ translated: { ...result }, stage: 'title' });

        // 翻译正文
        result.selftext = await this.translateText(post.selftext, 5000);
        onProgress({ translated: { ...result }, stage: 'selftext' });

        // 逐条翻译评论
        for (let i = 0; i < result.comments.length; i++) {
            const c = comments[i];
            result.comments[i].body = await this.translateText(c.body, 3000);
            onProgress({
                translated: { ...result, comments: [...result.comments] },
                stage: 'comment',
                commentIndex: i,
                total,
            });
        }

        return result;
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
