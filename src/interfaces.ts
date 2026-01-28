import { RedditPost, RedditComment, TranslatedPost } from './models';

export interface IRedditClient {
  fetchSubreddit(subreddit: string, after?: string): Promise<{
    posts: RedditPost[];
    after: string | null;
  }>;

  fetchPost(subreddit: string, postId: string): Promise<{
    post: RedditPost;
    comments: RedditComment[];
  }>;

  checkAuth(): Promise<string | null>;
  setAnonymousMode(enabled: boolean): void;
  updateCookie(newCookie: string): void;
}

export interface ITranslationService {
  translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost>;
  translateTitles(titles: string[]): Promise<string[]>;
  translatePostFast(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost>;
  updateConfig(apiKey: string, modelName: string, provider: string): void;
}
