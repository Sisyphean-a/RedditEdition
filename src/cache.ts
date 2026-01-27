import * as vscode from 'vscode';
import { Logger } from './logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const KEYS_TRACKER = '__managed_keys__';

export class CacheManager {
  constructor(private storage: vscode.Memento, private durationMinutes: number) {}

  get<T>(key: string): T | null {
    const entry = this.storage.get<CacheEntry<T>>(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const durationMs = this.durationMinutes * 60 * 1000;
    
    if (now - entry.timestamp > durationMs) {
      this.storage.update(key, undefined); // Clean up expired
      this.removeKeyFromTracker(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now()
    };
    this.storage.update(key, entry);
    this.addKeyToTracker(key);
  }

  async clear(): Promise<void> {
    const keys = this.storage.get<string[]>(KEYS_TRACKER, []);
    Logger.log(`Clearing ${keys.length} cache entries...`);
    
    for (const key of keys) {
        await this.storage.update(key, undefined);
    }
    
    await this.storage.update(KEYS_TRACKER, undefined);
    Logger.log('Cache cleared successfully.');
    vscode.window.showInformationMessage('Reddit Log Viewer: 缓存已清除');
  }
  
  private addKeyToTracker(key: string) {
      const keys = this.storage.get<string[]>(KEYS_TRACKER, []) || [];
      if (!keys.includes(key)) {
          keys.push(key);
          this.storage.update(KEYS_TRACKER, keys);
      }
  }

  private removeKeyFromTracker(key: string) {
      const keys = this.storage.get<string[]>(KEYS_TRACKER, []) || [];
      const index = keys.indexOf(key);
      if (index !== -1) {
          keys.splice(index, 1);
          this.storage.update(KEYS_TRACKER, keys);
      }
  }
}
