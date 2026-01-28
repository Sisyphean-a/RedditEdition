import * as vscode from 'vscode';
import axios from 'axios';
import { AuthServer } from './authServer';
import { Logger } from '@/infrastructure/utils/logger';
import { getConfig } from '@/infrastructure/utils/config';

export class OAuthManager {
  private static readonly KEY_REFRESH_TOKEN = 'reddit_refresh_token';
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private context: vscode.ExtensionContext) {}

  async login(): Promise<void> {
    const config = getConfig();
    const clientId = config.auth.clientId;
    const redirectUri = config.auth.redirectUri;

    if (!clientId) {
      throw new Error('未配置 Client ID。请在设置中配置 `logViewer.auth.clientId`。');
    }

    const state = Math.random().toString(36).substring(7);
    const scope = 'read identity mysubreddits';
    const authUrl = `https://www.reddit.com/api/v1/authorize?client_id=${clientId}&response_type=code&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&duration=permanent&scope=${scope}`;
    
    // Check if redirect URI is localhost
    const isLocalhost = redirectUri.startsWith('http://localhost') || redirectUri.startsWith('http://127.0.0.1');

    try {
      let code: string;

      if (isLocalhost) {
        // Automatic Flow
        const authServer = new AuthServer();
        const codePromise = authServer.start();
        await vscode.env.openExternal(vscode.Uri.parse(authUrl));
        code = await codePromise;
      } else {
        // Manual Flow (e.g., RedReader)
        await vscode.env.openExternal(vscode.Uri.parse(authUrl));
        
        const input = await vscode.window.showInputBox({
          prompt: '请粘贴授权后的完整回调链接 (或其中的 code 参数)',
          placeHolder: '例如: redreader://rr_oauth_redir?state=...&code=...',
          ignoreFocusOut: true,
          validateInput: (value) => value ? null : '内容不能为空'
        });

        if (!input) {
          throw new Error('用户取消了输入');
        }

        // Extract code from URL or use raw input
        try {
          // If input is a URL, try to parse it
          if (input.includes('code=')) {
             // Handle custom schemes that might not be parseable by standard URL if format is weird,
             // but assuming standard query param format:
             const match = input.match(/code=([^&]+)/);
             if (match && match[1]) {
               code = match[1];
               // Remove trailing #_ if present (Reddit adds this sometimes)
               if (code.endsWith('#_')) {
                   code = code.slice(0, -2);
               }
             } else {
                 throw new Error('无法从链接中提取 code');
             }
          } else {
            // Assume input is the raw code
            code = input.trim();
          }
        } catch (e) {
           // Fallback if URL parsing fails but it looks like a code
           code = input.trim();
        }
      }

      // Exchange token
      await this.exchangeToken(code, clientId, redirectUri);

      // Validate token
      const username = await this.validateSession();
      
      vscode.window.showInformationMessage(`Reddit 登录成功！欢迎, ${username}`);
    } catch (error) {
      Logger.error('Login failed: ' + error);
      vscode.window.showErrorMessage('登录失败: ' + error);
      throw error;
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Try refresh
    const refreshToken = await this.context.secrets.get(OAuthManager.KEY_REFRESH_TOKEN);
    if (refreshToken) {
        try {
            await this.refreshToken(refreshToken);
            return this.accessToken;
        } catch (e) {
            Logger.error('Failed to refresh token: ' + e);
            return null;
        }
    }

    return null;
  }

  private async exchangeToken(code: string, clientId: string, redirectUri: string) {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);

    const response = await axios.post('https://www.reddit.com/api/v1/access_token', params.toString(), {
      headers: {
        'Authorization': `Basic ${Buffer.from(clientId + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'vscode-reddit-edition/0.1.0'
      }
    });

    await this.handleTokenResponse(response.data);
  }

  private async validateSession(): Promise<string> {
    if (!this.accessToken) {
      throw new Error('No access token available for validation');
    }

    try {
      const response = await axios.get('https://oauth.reddit.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'vscode-reddit-edition/0.1.0'
        }
      });
      return response.data.name;
    } catch (error) {
      Logger.error('Session validation failed: ' + error);
      throw new Error('Token 验证失败，无法获取用户信息。请检查授权范围或网络连接。');
    }
  }

  private async refreshToken(refreshToken: string) {
    const config = getConfig();
    const clientId = config.auth.clientId;

    if (!clientId) {
        throw new Error('No Client ID configured');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const response = await axios.post('https://www.reddit.com/api/v1/access_token', params.toString(), {
      headers: {
        'Authorization': `Basic ${Buffer.from(clientId + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'vscode-reddit-edition/0.1.0'
      }
    });

    await this.handleTokenResponse(response.data);
  }

  private async handleTokenResponse(data: any) {
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Buffer 1 min

    if (data.refresh_token) {
      await this.context.secrets.store(OAuthManager.KEY_REFRESH_TOKEN, data.refresh_token);
    }
  }

  async logout() {
    this.accessToken = null;
    this.tokenExpiry = 0;
    await this.context.secrets.delete(OAuthManager.KEY_REFRESH_TOKEN);
    vscode.window.showInformationMessage('已退出登录');
  }
}
