import { RedditPost, TranslatedPost, TranslatedComment } from "../domain/models";

export class LogPresenter {
  constructor(private wordWrapWidth: number = 80) {}

  public updateConfig(wordWrapWidth: number) {
    this.wordWrapWidth = wordWrapWidth;
  }

  public render(original: RedditPost, translated: TranslatedPost, providerName?: string): string {
    const timestamp = new Date(original.created_utc * 1000).toLocaleString("zh-CN");
    const providerInfo = providerName ? ` | 翻译源: ${providerName.toUpperCase()}` : "";

    let log = `TIMESTAMP: ${timestamp} | REF: ${original.id}${providerInfo}
--------------------------------------------------------------------------------
标题: ${translated.title}
作者: ${original.author} | 评分: ${original.score} | 评论: ${original.num_comments}
--------------------------------------------------------------------------------

${translated.selftext || "(无正文内容)"}

--------------------------------------------------------------------------------
评论列表
--------------------------------------------------------------------------------
`;

    if (translated.comments) {
      log += this.formatComments(translated.comments, "", "");
    }

    log += `
--------------------------------------------------------------------------------
END OF LOG
--------------------------------------------------------------------------------
`;
    return log;
  }

  private formatComments(comments: TranslatedComment[], parentId: string, indent: string): string {
    let output = "";

    comments.forEach((c, i) => {
      const idx = i + 1;
      const currentId = parentId
        ? `${parentId}.${idx}`
        : String(idx).padStart(2, "0");
      const isLast = i === comments.length - 1;

      let header = "";
      let bodyIndent = "";
      let childIndent = "";

      if (!parentId) {
        header = `> #${currentId} ${c.author}`;
        bodyIndent = "  ";
        childIndent = "  ";
      } else {
        const branch = isLast ? "└─ " : "├─ ";
        header = `${indent}${branch}#${currentId} ${c.author}`;

        const vertical = isLast ? "   " : "│  ";
        bodyIndent = `${indent}${vertical}`;
        childIndent = `${indent}${vertical}`;
      }

      output += `${header}\n`;

      const wrappedLines = this.wordWrap(c.body, this.wordWrapWidth);
      for (const line of wrappedLines) {
        if (line.trim()) {
          output += `${bodyIndent}${line}\n`;
        }
      }

      output += `\n`;

      if (c.replies && c.replies.length > 0) {
        output += this.formatComments(c.replies, currentId, childIndent);
      }
    });
    return output;
  }

  private wordWrap(text: string, maxLength: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split("\n");

    for (const para of paragraphs) {
      if (!para) continue;

      let remaining = para;
      while (remaining.length > maxLength) {
        let splitIndex = maxLength;
        const spaceIndex = remaining.lastIndexOf(" ", maxLength);

        if (spaceIndex > maxLength * 0.7) {
          splitIndex = spaceIndex;
        }

        lines.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trim();
      }

      if (remaining) {
        lines.push(remaining);
      }
    }
    return lines;
  }
}
