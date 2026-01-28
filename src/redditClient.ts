import axios from 'axios';
import { RateLimiter } from './rateLimiter';
import { OAuthManager } from './oauthManager';

import { IRedditClient } from './interfaces';
import { RedditPost, RedditComment } from './models';

export class RedditClient implements IRedditClient {
  constructor(
    private limiter: RateLimiter, 
    private cookie: string,
    private oauthManager?: OAuthManager,
    private isAnonymous: boolean = false
  ) {}

  setAnonymousMode(enabled: boolean) {
    this.isAnonymous = enabled;
  }

  updateCookie(newCookie: string) {
    this.cookie = newCookie;
  }

  private async getHeaders() {
    const headers: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (this.isAnonymous) {
      return headers;
    }

    if (this.oauthManager) {
      const token = await this.oauthManager.getAccessToken();
      if (token) {
        headers['Authorization'] = `bearer ${token}`;
        return headers;
      }
    }

    if (this.cookie) {
      headers['Cookie'] = this.cookie;
    }

    return headers;
  }

  async fetchSubreddit(subreddit: string, after?: string): Promise<{
    posts: RedditPost[];
    after: string | null;
  }> {
    await this.limiter.acquire();
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25${after ? `&after=${after}` : ''}`;
    
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(url, { headers });
      const data = response.data.data;
      
      const posts = data.children.map((child: any) => ({
        id: child.data.id,
        title: child.data.title,
        selftext: child.data.selftext,
        author: child.data.author,
        score: child.data.score,
        created_utc: child.data.created_utc,
        num_comments: child.data.num_comments
      }));

      return {
        posts,
        after: data.after
      };
    } catch (error) {
      console.error('Failed to fetch subreddit:', error);
      throw error;
    }
  }

  async fetchPost(subreddit: string, postId: string): Promise<{
    post: RedditPost;
    comments: RedditComment[];
  }> {
    await this.limiter.acquire();
    const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;

    try {
      const headers = await this.getHeaders();
      const response = await axios.get(url, { headers });
      // Reddit returns array: [postListing, commentListing]
      const postData = response.data[0].data.children[0].data;
      const commentsData = response.data[1].data.children;

      const post: RedditPost = {
        id: postData.id,
        title: postData.title,
        selftext: postData.selftext,
        author: postData.author,
        score: postData.score,
        created_utc: postData.created_utc,
        num_comments: postData.num_comments
      };

      const comments = this.processComments(commentsData);

      return { post, comments };
    } catch (error) {
      console.error('Failed to fetch post:', error);
      throw error;
    }
  }

  async checkAuth(): Promise<string | null> {
    await this.limiter.acquire();
    const url = 'https://www.reddit.com/api/v1/me.json';

    try {
      const headers = await this.getHeaders();
      const response = await axios.get(url, { headers });
      return response.data.name; // Returns username if authenticated
    } catch (error) {
      // 403 or 401 means not authenticated
      return null;
    }
  }

  private processComments(children: any[]): RedditComment[] {
    return children
      .filter(child => child.kind === 't1') // t1 is comment
      .map(child => {
        const data = child.data;
        return {
          id: data.id,
          author: data.author,
          body: data.body,
          score: data.score,
          replies: data.replies ? this.processComments(data.replies.data.children) : []
        };
      });
  }
}
