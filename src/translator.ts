import { RedditPost, RedditComment, TranslatedPost, TranslatedComment } from "./models";
import { ITranslationService, TranslationProgress } from "./interfaces";
import { Logger } from "./logger";
import { ITranslationStrategy, GeminiStrategy, MachineStrategy } from "./translationStrategies";

export class Translator implements ITranslationService {
  private strategy: ITranslationStrategy;
  private machineStrategy: MachineStrategy; // Fallback

  constructor(
    private apiKey: string, 
    private modelName: string, 
    private provider: string = 'machine'
  ) {
    this.machineStrategy = new MachineStrategy(); // Always keep machine ready for fallback
    this.strategy = this.createStrategy();
  }

  updateConfig(apiKey: string, modelName: string, provider: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.provider = provider;
    this.strategy = this.createStrategy();
    Logger.log(`Translator config updated: Strategy=${provider}, Model=${modelName}`);
  }

  private createStrategy(): ITranslationStrategy {
    if (this.provider === 'ai' && this.apiKey) {
      return new GeminiStrategy(this.apiKey, this.modelName);
    }
    return this.machineStrategy;
  }

  async translatePost(post: RedditPost, comments: RedditComment[]): Promise<TranslatedPost> {
    try {
      return await this.strategy.translatePost(post, comments);
    } catch (error) {
       Logger.error("Translation strategy failed, switching to fallback...", error);
       if (this.strategy !== this.machineStrategy) {
         return this.machineStrategy.translatePost(post, comments);
       }
       throw error;
    }
  }

  async translatePostStream(
    post: RedditPost,
    comments: RedditComment[],
    onProgress: (progress: TranslationProgress) => void
  ): Promise<TranslatedPost> {
    // 如果当前策略支持流式，使用流式；否则降级到机械翻译流式
    if (this.strategy.translatePostStream) {
      try {
        return await this.strategy.translatePostStream(post, comments, onProgress);
      } catch (error) {
        Logger.error("Stream translation failed, switching to fallback...", error);
      }
    }
    // AI 策略不支持流式，或失败时，使用机械翻译的流式
    return this.machineStrategy.translatePostStream(post, comments, onProgress);
  }

  async translateTitles(titles: string[]): Promise<string[]> {
    try {
      return await this.strategy.translateTitles(titles);
    } catch (error) {
       // Fallback silently for titles to avoid UI noise
       return this.machineStrategy.translateTitles(titles);
    }
  }

  // 快速翻译模式：直接返回原文结构，用于占位
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
}
