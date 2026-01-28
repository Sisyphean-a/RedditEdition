import * as vscode from 'vscode';

export interface Config {
  redditCookie: string;
  subreddits: string[];
  geminiApiKey: string;
  geminiModel: string;
  translationProvider: string;
  cacheDuration: number; // 分钟
  wordWrapWidth: number;
  auth: {
    clientId: string;
    redirectUri: string;
    anonymous: boolean;
  };
}

export function getConfig(): Config {
  const config = vscode.workspace.getConfiguration('logViewer');
  return {
    redditCookie: config.get<string>('redditCookie', ''),
    subreddits: config.get<string[]>('subreddits', ['programming']),
    geminiApiKey: config.get<string>('geminiApiKey', ''),
    geminiModel: config.get<string>('geminiModel', 'gemini-2.5-flash-lite'),
    translationProvider: config.get<string>('translationProvider', 'machine'),
    cacheDuration: config.get<number>('cacheDuration', 30),
    wordWrapWidth: config.get<number>('wordWrapWidth', 80),
    auth: {
      clientId: config.get<string>('auth.clientId', ''),
      redirectUri: config.get<string>('auth.redirectUri', 'http://localhost:54321/callback'),
      anonymous: config.get<boolean>('auth.anonymous', false)
    }
  };
}
