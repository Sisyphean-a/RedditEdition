import * as http from 'http';
import * as url from 'url';
import { Logger } from '../utils/logger';

export class AuthServer {
  private server: http.Server | null = null;
  private port = 54321;

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          if (!req.url) {
            res.writeHead(400);
            res.end('Invalid request');
            return;
          }

          const parsedUrl = url.parse(req.url, true);
          
          if (parsedUrl.pathname === '/callback') {
            const error = parsedUrl.query.error;
            const code = parsedUrl.query.code;

            if (error) {
              res.writeHead(400);
              res.end(`Authentication failed: ${error}`);
              reject(new Error(`Auth failed: ${error}`));
              return;
            }

            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html>
                  <body style="background: #1a1a1a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh;">
                    <div style="text-align: center;">
                      <h1 style="color: #4CAF50;">✅ Login Successful</h1>
                      <p>Authentication complete. You can close this window now.</p>
                      <script>window.setTimeout(() => window.close(), 2000);</script>
                    </div>
                  </body>
                </html>
              `);
              resolve(code as string);
            } else {
              res.writeHead(400);
              res.end('Missing code parameter');
            }
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } catch (e) {
            Logger.error('Auth server error: ' + e);
            res.writeHead(500);
            res.end('Server error');
        } finally {
            // Close server after handling callback
            if (this.server) {
                this.server.close();
                this.server = null;
            }
        }
      });

      this.server.listen(this.port, () => {
        Logger.log(`Auth server listening on http://localhost:${this.port}`);
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
