import * as vscode from 'vscode';

export interface Config {
  redditCookie: string;
  subreddits: string[];
  geminiApiKey: string;
  cacheDuration: number; // 分钟
}

export function getConfig(): Config {
  const config = vscode.workspace.getConfiguration('logViewer');
  return {
    redditCookie: config.get<string>('redditCookie', ''),
    subreddits: config.get<string[]>('subreddits', ['programming']),
    geminiApiKey: config.get<string>('geminiApiKey', ''),
    cacheDuration: config.get<number>('cacheDuration', 30)
  };
}
