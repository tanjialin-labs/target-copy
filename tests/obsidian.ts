export class TFile {
  readonly name: string;
  readonly basename: string;
  readonly extension: string;
  readonly stat: { size: number };
  constructor(readonly path: string, bytes = 3) {
    this.name = path.split("/").at(-1)!;
    this.extension = this.name.split(".").at(-1)!;
    this.basename = this.name.slice(0, -this.extension.length - 1);
    this.stat = { size: bytes };
  }
}
