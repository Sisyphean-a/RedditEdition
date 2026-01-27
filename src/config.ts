import * as vscode from 'vscode';

export interface Config {
  redditCookie: string;
  subreddits: string[];
  geminiApiKey: string;
  geminiModel: string;
  cacheDuration: number; // 分钟
  wordWrapWidth: number;
}

export function getConfig(): Config {
  const config = vscode.workspace.getConfiguration('logViewer');
  return {
    redditCookie: config.get<string>('redditCookie', ''),
    subreddits: config.get<string[]>('subreddits', ['programming']),
    geminiApiKey: config.get<string>('geminiApiKey', ''),
    geminiModel: config.get<string>('geminiModel', 'gemini-2.5-flash-lite'),
    cacheDuration: config.get<number>('cacheDuration', 30),
    wordWrapWidth: config.get<number>('wordWrapWidth', 80)
  };
}
