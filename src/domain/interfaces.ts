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
  isAnonymousMode(): Promise<boolean>;
}

export interface TranslationProgress {
  translated: TranslatedPost;
  stage: 'title' | 'selftext' | 'comment';
  commentIndex?: number;
  total?: number;
}

export interface ITranslationService {
  translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost>;
  translatePostStream(
    post: RedditPost,
    comments: RedditComment[],
    onProgress: (progress: TranslationProgress) => void
  ): Promise<TranslatedPost>;
  translateTitles(titles: string[]): Promise<string[]>;
  translatePostFast(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost>;
  updateConfig(apiKey: string, modelName: string, provider: string): void;
  getProviderName(): string;
}
