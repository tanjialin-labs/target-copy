export class LatestTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(isLatest: () => boolean, task: () => Promise<T>): Promise<T | undefined> {
    const result = this.tail
      .catch(() => undefined)
      .then(async () => (isLatest() ? task() : undefined));

    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
