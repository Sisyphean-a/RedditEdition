import * as vscode from 'vscode';

export class Logger {
    private static _outputChannel: vscode.OutputChannel;

    public static initialize(context: vscode.ExtensionContext, name: string) {
        this._outputChannel = vscode.window.createOutputChannel(name);
        context.subscriptions.push(this._outputChannel);
    }

    public static log(message: string, ...args: any[]) {
        const timestamp = new Date().toLocaleTimeString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => JSON.stringify(arg, null, 2)).join(' ') : '';
        this._outputChannel.appendLine(`[${timestamp}] [INFO] ${message}${formattedArgs}`);
    }

    public static error(message: string, error?: any) {
        const timestamp = new Date().toLocaleTimeString();
        const errorStack = error instanceof Error ? error.stack : JSON.stringify(error, null, 2);
        this._outputChannel.appendLine(`[${timestamp}] [ERROR] ${message} ${errorStack || ''}`);
        this._outputChannel.show(true); // Bring to front on error
    }

    public static show() {
        this._outputChannel.show();
    }
}
