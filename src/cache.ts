import * as vscode from 'vscode';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

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
  }

  clear(): void {
    // Note: globalState doesn't have a clear method to clear ONLY our keys effectively without prefixing everything carefully or iterating (which Memento doesn't support directly).
    // For now, we rely on overwrite or new keys. 
    // However, to truly clear, we might want to store a list of keys we added if we want to wipe perfectly, 
    // or just rely on manual update(key, undefined) for known keys.
    // Given the API limitations, we might just not implement a full "wipe everything" unless we track keys.
    // Let's defer full clear logic or implement a simple key tracker if needed.
    // For this version, we'll placeholder it as we can't iterate memento.
    // A workaround involves using a secret token or prefixing.
    // We will assume keys are managed individually for now.
    // Actually, let's just make it a no-op or specific key clearing if known.
    // WAIT, if we put everything in a single JSON object under one key, we can clear it.
    // BUT that limits size.
    // Let's stick to individual keys and just accept clear might need to be specific or we track keys in a Set stored in storage.
  }
  
  // Helper to add a key to tracking set
  private trackKey(key: string) {
      // implementation tracking would go here
  }
}
