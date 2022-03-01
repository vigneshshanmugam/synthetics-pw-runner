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

import {
  Reporter,
  TestCase,
  TestResult,
  TestStep,
  Suite,
  FullResult,
  FullConfig,
  TestStatus,
} from "@playwright/test/reporter";
import SonicBoom from "sonic-boom";
import fs from "fs";
import { Params, NetworkInfo } from "../common_types";
import snakeCaseKeys from "snakecase-keys";
import { formatError, getTimestamp, getDurationInUs } from "../helpers";

type OutputType =
  | "synthetics/metadata"
  | "journey/register"
  | "journey/start"
  | "screenshot/block"
  | "step/screenshot_ref"
  | "step/screenshot"
  | "step/metrics"
  | "step/filmstrips"
  | "step/end"
  | "journey/network_info"
  | "journey/browserconsole"
  | "journey/end";

type Payload = {
  source?: string;
  duration?: number;
  url?: string;
  status?: TestStatus | number;
  params?: Params;
  type?: OutputType;
  text?: string;
  index?: number;
};

type Journey = {
  name: string;
  id?: string;
  callback?: () => void;
};

type OutputFields = {
  type: OutputType;
  _id?: string;
  journey?: Journey;
  timestamp?: number;
  url?: string;
  step?: {
    name: string;
    index: number;
    duration?: {
      us: number;
    };
  };
  error?: Error;
  root_fields?: Record<string, unknown>;
  payload?: Payload | Partial<NetworkInfo>;
  blob?: string;
  blob_mime?: string;
};

type ScreenshotBlob = {
  blob: string;
  id: string;
};

type ScreenshotReference = {
  width: number;
  height: number;
  blocks: Array<{
    hash: string;
    top: number;
    left: number;
    width: number;
    height: number;
  }>;
};

function journeyInfo(
  journey: OutputFields["journey"],
  type: OutputFields["type"],
  status: Payload["status"]
) {
  if (!journey) {
    return;
  }
  return {
    name: journey.name,
    id: journey.id,
    status: type === "journey/end" ? status : undefined,
  };
}

function stepInfo(
  step: OutputFields["step"],
  type: OutputFields["type"],
  status: Payload["status"]
) {
  if (!step) {
    return;
  }
  return {
    name: step.name,
    index: step.index,
    status: type === "step/end" ? status : undefined,
    duration: step.duration,
  };
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { version, name } = require("../../package.json");
function getMetadata() {
  return {
    os: {
      platform: process.platform,
    },
    package: {
      name,
      version,
    },
  };
}

function formatVersion(protocol: string | undefined) {
  if (!protocol) {
    return;
  }
  if (protocol === "h2") {
    return 2;
  } else if (protocol === "http/1.1") {
    return 1.1;
  } else if (protocol === "http/1.0") {
    return 1.0;
  } else if (protocol.startsWith("h3")) {
    return 3;
  }
}

function formatRequest(request: NetworkInfo["request"]) {
  const postData = request.postData ? request.postData : "";
  return {
    ...request,
    body: {
      bytes: postData.length,
      content: postData,
    },
    referrer: request.headers?.Referer,
  };
}

function formatResponse(response: NetworkInfo["response"]) {
  if (!response) {
    return;
  }
  return response;
}

function formatTLS(tls: NetworkInfo["response"]["securityDetails"]) {
  if (!tls) {
    return;
  }
  const [name, version] = tls.protocol.toLowerCase().split(" ");
  return {
    server: {
      x509: {
        issuer: {
          common_name: tls.issuer,
        },
        subject: {
          common_name: tls.subjectName,
        },
        not_after: new Date(tls.validTo * 1000).toISOString(),
        not_before: new Date(tls.validFrom * 1000).toISOString(),
      },
    },
    version_protocol: name,
    version: version,
  };
}

export function formatNetworkFields(network: NetworkInfo) {
  const { request, response, url, browser } = network;
  const ecs = {
    // URL would be parsed and mapped by heartbeat
    url,
    user_agent: {
      name: browser.name,
      version: browser.version,
      original: request.headers?.["User-Agent"],
    },
    http: {
      version: formatVersion(response?.protocol),
      request: formatRequest(request),
      response: formatResponse(response),
    },
    tls: formatTLS(response?.securityDetails),
  };

  const pickItems: Array<keyof NetworkInfo> = [
    "browser",
    "status",
    "method",
    "type",
    "isNavigationRequest",
    "requestSentTime",
    "responseReceivedTime",
    "loadEndTime",
    "transferSize",
    "resourceSize",
    "timings",
  ];
  const payload: Partial<NetworkInfo> = pickItems.reduce((acc, value) => {
    network[value] && (acc[value] = network[value]);
    return acc;
  }, {});

  return { ecs, payload };
}

class JSONReporter implements Reporter {
  stream: SonicBoom;
  fd: number;
  stepCount = 0;

  constructor() {
    // this.stepCount = 0;
    this.fd = process.stdout.fd;
    this.stream = new SonicBoom({ fd: this.fd, sync: true, minLength: 1 });
  }

  printsToStdio() {
    return true;
  }

  onBegin(config: FullConfig<{}, {}>, suite: Suite): void {
    this.writeJSON({
      type: "synthetics/metadata",
      root_fields: {
        num_journeys: suite.allTests().length,
      },
    });
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    const journey: Journey = {
      name: test.title,
      id: test.title,
      callback: () => "",
    };
    this.writeJSON({
      type: "journey/start",
      journey,
    });
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    if (step.category !== "test.step") {
      return;
    }
    this.stepCount++;

    this.writeJSON({
      type: "step/end",
      journey: { name: test.title, id: test.title },
      step: {
        name: step.title,
        index: this.stepCount,
        duration: {
          us: getDurationInUs(step.duration),
        },
      },
      error: formatError(step.error),
      payload: {
        status: result.status,
      },
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const journey = { name: test.title, id: test.title };

    const filmstrips = result.attachments.find(
      (att) => att.name === "filmstrips"
    );

    console.log(JSON.parse(filmstrips.body.toString()));

    const screenshots = result.attachments.filter(
      (att) => att.name === "screenshot"
    );
    const network = result.attachments.find((att) => att.name === "network");
    if (network) {
      const networkInfo: NetworkInfo[] = JSON.parse(network.body.toString());
      networkInfo.forEach((ni) => {
        const { ecs, payload } = formatNetworkFields(ni);
        this.writeJSON({
          type: "journey/network_info",
          journey,
          root_fields: snakeCaseKeys(ecs),
          payload: snakeCaseKeys(payload),
        });
      });
    }

    if (screenshots.length > 0) {
      screenshots.map((screenshot) => {
        try {
          const buffer = fs.readFileSync(screenshot.path, "base64");
          this.writeJSON({
            type: "step/screenshot",
            journey,
            blob: buffer,
            blob_mime: "image/png",
          });
        } catch {}
      });
    }

    this.writeJSON({
      type: "journey/end",
      journey,
      error: formatError(result.error),
      payload: {
        duration: getDurationInUs(result.duration),
        status: result.status,
      },
    });
  }

  onEnd(result: FullResult) {
    this.stream.flush();
  }

  writeJSON({
    _id,
    journey,
    type,
    timestamp,
    step,
    root_fields,
    error,
    payload,
    blob,
    blob_mime,
    url,
  }: OutputFields) {
    this.write({
      type,
      _id,
      "@timestamp": timestamp || getTimestamp(),
      journey: journeyInfo(journey, type, payload?.status),
      step: stepInfo(step, type, payload?.status),
      root_fields: { ...(root_fields || {}), ...getMetadata() },
      payload,
      blob,
      blob_mime,
      error: formatError(error),
      url,
    });
  }

  write(message) {
    if (typeof message == "object") {
      message = JSON.stringify(message);
    }
    // this.stream.write(message + "\n");
  }
}
export default JSONReporter;
