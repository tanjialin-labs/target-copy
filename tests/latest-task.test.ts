import { describe, expect, it } from "vitest";

import { LatestTaskQueue } from "../src/core/latest-task";

describe("LatestTaskQueue", () => {
  it("serializes writes so the newest task always finishes last", async () => {
    const queue = new LatestTaskQueue();
    const events: string[] = [];
    let latest = 1;
    let releaseFirst!: () => void;
    let markStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(
      () => latest === 1,
      async () => {
        events.push("first-start");
        markStarted();
        await firstGate;
        events.push("first-end");
        return "first";
      },
    );
    await firstStarted;

    latest = 2;
    const second = queue.run(
      () => latest === 2,
      async () => {
        events.push("second");
        return "second";
      },
    );
    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first-start", "first-end", "second"]);
  });

  it("skips an obsolete task before it starts", async () => {
    const queue = new LatestTaskQueue();
    let latest = 1;
    const first = queue.run(() => latest === 1, async () => "obsolete");
    latest = 2;
    const second = queue.run(() => latest === 2, async () => "latest");

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBe("latest");
  });
});
