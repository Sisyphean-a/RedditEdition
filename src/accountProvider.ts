import * as vscode from 'vscode';
import { OAuthManager } from './oauthManager';
import { RedditClient } from './redditClient';

export class AccountProvider implements vscode.TreeDataProvider<AccountItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AccountItem | undefined | null | void> = new vscode.EventEmitter<AccountItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<AccountItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(
    private oauthManager: OAuthManager,
    private client: RedditClient
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AccountItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AccountItem): Promise<AccountItem[]> {
    if (element) {
      return [];
    }

    const items: AccountItem[] = [];

    // Login Status
    const username = await this.client.checkAuth();
    if (username) {
        items.push(new AccountItem(`用户: ${username}`, vscode.TreeItemCollapsibleState.None, 'verified', 'login'));
        items.push(new AccountItem('状态: 已认证 (OAuth)', vscode.TreeItemCollapsibleState.None, 'shield', 'login'));
        
        const logoutItem = new AccountItem('退出登录', vscode.TreeItemCollapsibleState.None, 'sign-out', 'logout');
        logoutItem.command = {
            command: 'logViewer.logout',
            title: 'Logout'
        };
        items.push(logoutItem);

    } else {
        const isAnonymous = await this.client.isAnonymousMode();
        if (isAnonymous) {
            items.push(new AccountItem('用户: 游客 (Guest)', vscode.TreeItemCollapsibleState.None, 'eye', 'login'));
        } else {
             items.push(new AccountItem('用户: 未登录', vscode.TreeItemCollapsibleState.None, 'account', 'login'));
        }
        
        const loginAuthItem = new AccountItem('登录 (OAuth2)', vscode.TreeItemCollapsibleState.None, 'sign-in', 'login');
        loginAuthItem.command = {
            command: 'logViewer.login',
            title: 'Login with OAuth2'
        };
        items.push(loginAuthItem);

        const guestItem = new AccountItem(isAnonymous ? '关闭匿名模式' : '开启匿名模式', vscode.TreeItemCollapsibleState.None, isAnonymous ? 'eye-closed' : 'eye', 'login');
        guestItem.command = {
            command: 'logViewer.toggleAnonymous',
            title: 'Toggle Anonymous'
        };
         items.push(guestItem);
    }

    // Divider or Spacer (Visual only)
    
    // Settings & Cache
    const settingsItem = new AccountItem('设置', vscode.TreeItemCollapsibleState.None, 'settings-gear', 'setting');
    settingsItem.command = {
        command: 'logViewer.openSettings',
        title: 'Open Settings'
    };
    items.push(settingsItem);

    const cacheItem = new AccountItem('清除缓存', vscode.TreeItemCollapsibleState.None, 'trash', 'setting');
    cacheItem.command = {
        command: 'logViewer.clearCache',
        title: 'Clear Cache'
    };
    items.push(cacheItem);

    return items;
  }
}

class AccountItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    iconName: string,
    contextValue: string
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    this.contextValue = contextValue;
    this.iconPath = new vscode.ThemeIcon(iconName);
  }
}
