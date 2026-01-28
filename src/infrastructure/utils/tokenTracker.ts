import * as vscode from 'vscode';

export class TokenTracker {
  private _totalTokens: number = 0;
  private _onDidChange = new vscode.EventEmitter<number>();
  readonly onDidChange = this._onDidChange.event;

  get totalTokens(): number {
    return this._totalTokens;
  }

  addUsage(count: number) {
    if (count > 0) {
      this._totalTokens += count;
      this._onDidChange.fire(this._totalTokens);
    }
  }

  reset() {
    this._totalTokens = 0;
    this._onDidChange.fire(0);
  }
}
