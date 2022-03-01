/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { CDPSession } from "@playwright/test";
import { PluginOutput, Filmstrip } from "../common_types";

export type TraceOptions = {
  filmstrips?: boolean;
  trace?: boolean;
};

export type TraceEvent = {
  name: string;
  cat: string;
  pid: number;
  tid: number;
  ph?: string;
  args?: {
    snapshot?: string;
    frame: string;
    data: {
      had_recent_input: boolean;
      is_main_frame: boolean;
      cumulative_score: number;
      score: number;
      weighted_score_delta: number;
    } & Record<string, unknown>;
  };
  ts: number;
};

export class Tracing {
  async start(client: CDPSession) {
    const includedCategories = ["-*"];
    includedCategories.push("disabled-by-default-devtools.screenshot");

    await client.send("Tracing.start", {
      transferMode: "ReportEvents",
      categories: includedCategories.join(","),
      options: "sampling-frequency=10000", // 1000 is default
    });
  }

  async stop(client: CDPSession) {
    const events = [];
    const collectListener = (payload) => events.push(...payload.value);
    client.on("Tracing.dataCollected", collectListener);

    const [traceEvents] = await Promise.all([
      new Promise((resolve) =>
        client.once("Tracing.tracingComplete", () => {
          client.off("Tracing.dataCollected", collectListener);
          resolve(events);
        })
      ),
      client.send("Tracing.end"),
    ]);
    const output: Partial<PluginOutput> = {};
    output.filmstrips = Filmstrips.compute(traceEvents as Array<TraceEvent>);
    return output;
  }
}

export class Filmstrips {
  static filterExcesssiveScreenshots(events: Array<TraceEvent>) {
    const screenshotEvents = events.filter(
      (evt) => evt.name === "Screenshot" && evt.args?.snapshot
    );
    const screenshotTimestamps = screenshotEvents.map((event) => event.ts);

    let lastScreenshotTs = -Infinity;
    return screenshotEvents.filter((evt) => {
      const timeSinceLastScreenshot = evt.ts - lastScreenshotTs;
      const nextScreenshotTs = screenshotTimestamps.find((ts) => ts > evt.ts);
      const timeUntilNextScreenshot = nextScreenshotTs
        ? nextScreenshotTs - evt.ts
        : Infinity;
      const threshold = 500 * 1000;
      const shouldKeep =
        timeUntilNextScreenshot > threshold ||
        timeSinceLastScreenshot > threshold;
      if (shouldKeep) lastScreenshotTs = evt.ts;
      return shouldKeep;
    });
  }

  static compute(traceEvents: Array<TraceEvent>): Array<Filmstrip> {
    return Filmstrips.filterExcesssiveScreenshots(traceEvents).map((event) => ({
      blob: event.args.snapshot,
      mime: "image/jpeg",
      start: {
        us: event.ts,
      },
    }));
  }
}
