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

import { red, green, yellow, cyan } from "kleur/colors";
import os from "os";
import { resolve, join, dirname } from "path";
import fs from "fs";
import { promisify } from "util";
import { performance } from "perf_hooks";
import { HooksArgs, HooksCallback } from "./common_types";
import { TestError } from "@playwright/test";

const lstatAsync = promisify(fs.lstat);
const readdirAsync = promisify(fs.readdir);

export const readFileAsync = promisify(fs.readFile);
export const writeFileAsync = promisify(fs.writeFile);
export const mkdirAsync = promisify(fs.mkdir);

const SEPARATOR = "\n";

export function noop() {}

export function indent(lines: string, tab = "   ") {
  return lines.replace(/^/gm, tab);
}

/**
 *  Disable unicode symbols for windows, the underlying
 *  FS stream has a known issue in windows
 */
const NO_UTF8_SUPPORT = process.platform === "win32";
export const symbols = {
  warning: yellow(NO_UTF8_SUPPORT ? "!" : "⚠"),
  skipped: cyan("-"),
  succeeded: green(NO_UTF8_SUPPORT ? "ok" : "✓"),
  failed: red(NO_UTF8_SUPPORT ? "x" : "✖"),
};

export function generateUniqueId() {
  return `${Date.now() + Math.floor(Math.random() * 1e13)}`;
}

export function generateTempPath() {
  return join(os.tmpdir(), `synthetics-${generateUniqueId()}`);
}

/**
 * Get Monotonically increasing time in seconds since
 * an arbitrary point in the past.
 *
 * We internally use the monotonically increasing clock timing
 * similar to the chrome devtools protocol network events for
 * journey,step start/end fields to make querying in the UI easier
 */
export function monotonicTimeInSeconds() {
  const hrTime = process.hrtime(); // [seconds, nanoseconds]
  return hrTime[0] * 1 + hrTime[1] / 1e9;
}

/**
 * Converts the trace events timestamp field from microsecond
 * resolution to monotonic seconds timestamp similar to other event types (journey, step, etc)
 * Reference - https://github.com/samccone/chrome-trace-event/blob/d45bc8af3b5c53a3adfa2c5fc107b4fae054f579/lib/trace-event.ts#L21-L22
 *
 * Tested and verified on both Darwin and Linux
 */
export function microSecsToSeconds(ts: number) {
  return ts / 1e6;
}

/**
 * Timestamp at which the current node process began.
 */
const processStart = performance.timeOrigin;
export function getTimestamp() {
  return (processStart + now()) * 1000;
}

/**
 * Relative current time from the start of the current node process
 */
export function now() {
  return performance.now();
}

/**
 * Execute all the hooks callbacks in parallel using Promise.all
 */
export async function runParallel(
  callbacks: Array<HooksCallback>,
  args: HooksArgs
) {
  const promises = callbacks.map((cb) => cb(args));
  return await Promise.all(promises);
}

export function isDepInstalled(dep) {
  try {
    return require.resolve(dep);
  } catch (e) {
    return false;
  }
}

export function isDirectory(path) {
  return fs.existsSync(path) && fs.statSync(path).isDirectory();
}

export function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Traverse the directory tree up from the cwd until we find
 * package.json file to check if the user is invoking our script
 * from an NPM project.
 */
export function findPkgJsonByTraversing(resolvePath, cwd) {
  const packageJSON = resolve(resolvePath, "package.json");
  if (isFile(packageJSON)) {
    return packageJSON;
  }
  const parentDirectory = dirname(resolvePath);
  /**
   * We are in the system root and package.json does not exist
   */
  if (resolvePath === parentDirectory) {
    throw red(
      `Could not find package.json file in: "${cwd}"\n` +
        `It is recommended to run the agent in an NPM project.\n` +
        `You can create one by running "npm init -y" in the project folder.`
    );
  }
  return findPkgJsonByTraversing(parentDirectory, cwd);
}

/**
 * Modified version of `totalist` package that handles the symlink issue
 * and avoids infinite recursion
 *
 * Based on code from totalist!
 * https://github.com/lukeed/totalist/blob/44379974e535afe9c38e8d643dd64c59101a14b9/src/async.js#L8
 */
export async function totalist(
  dir: string,
  callback: (relPath: string, absPath: string) => any,
  pre = ""
) {
  dir = resolve(".", dir);
  await readdirAsync(dir).then((arr) => {
    return Promise.all(
      arr.map((str) => {
        const abs = join(dir, str);
        return lstatAsync(abs).then((stats) =>
          stats.isDirectory()
            ? totalist(abs, callback, join(pre, str))
            : callback(join(pre, str), abs)
        );
      })
    );
  });
}

export function formatError(error: TestError) {
  if (!error) {
    return;
  }

  const { message, stack } = error;
  return {
    name: message,
    message,
    stack,
  };
}

const cwd = process.cwd();
/**
 * Synthetics cache path that is based on the process id to make sure
 * each process does not modify the caching layer used by other process
 * once we move to executing journeys in parallel
 */
export const CACHE_PATH = join(cwd, ".synthetics", process.pid.toString());

export function getDurationInUs(duration: number) {
  return Math.trunc(duration * 1e6);
}
