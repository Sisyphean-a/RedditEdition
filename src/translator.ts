import { GoogleGenerativeAI } from '@google/generative-ai';
import { RedditPost, RedditComment } from './redditClient';

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

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Prepare a simplified structure for translation to save tokens and reduce complexity
    const payload = {
      title: post.title,
      selftext: post.selftext,
      comments: comments.slice(0, 10).map(c => this.simplifyComment(c, 0, 3)) // Limit top level and depth
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
      const response = await result.response;
      const text = response.text();
      // Clean up markdown code blocks if present
      const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(jsonStr) as TranslatedPost;
    } catch (error) {
      console.error('Translation failed:', error);
      // Fallback: return original text if translation fails
      return {
          title: post.title + " (翻译失败)",
          selftext: post.selftext,
          comments: [] // Return empty or map original
      };
    }
  }

  private simplifyComment(comment: RedditComment, depth: number, maxDepth: number): any {
      if (depth >= maxDepth) return null;
      
      const simplified: any = {
          author: comment.author,
          body: comment.body
      };

      if (comment.replies && comment.replies.length > 0) {
          const replies = comment.replies
              .map(r => this.simplifyComment(r, depth + 1, maxDepth))
              .filter(r => r !== null);
          if (replies.length > 0) {
              simplified.replies = replies;
          }
      }
      return simplified;
  }
}
