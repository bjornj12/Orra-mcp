// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)|\x1b[()][AB012]|\x1b\[[0-9]*[JKH]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, "");
}

export class StreamParser {
  private _totalBytes = 0;

  constructor(private onChunk: (cleanChunk: string) => void) {}

  get totalBytes(): number {
    return this._totalBytes;
  }

  feed(rawData: string): void {
    this._totalBytes += rawData.length;
    const clean = stripAnsi(rawData);
    if (clean.length > 0) {
      this.onChunk(clean);
    }
  }
}
