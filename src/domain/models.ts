
export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  created_utc: number;
  num_comments: number;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  replies: RedditComment[];
}

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
