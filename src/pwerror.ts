/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { FullConfig, TestError, TestCase } from "@playwright/test/reporter";
import { codeFrameColumns } from "@babel/code-frame";
import StackUtils from "stack-utils";
import fs from "fs";
import path from "path";
const stackUtils = new StackUtils();

type Location = TestCase["location"];

export function prepareErrorStack(
  stack: string,
  file?: string
): {
  message: string;
  stackLines: string[];
  location?: Location;
} {
  if (file) {
    // Stack will have /private/var/folders instead of /var/folders on Mac.
    file = fs.realpathSync(file);
  }
  const lines = stack.split("\n");
  let firstStackLine = lines.findIndex((line) => line.startsWith("    at "));
  if (firstStackLine === -1) firstStackLine = lines.length;
  const message = lines.slice(0, firstStackLine).join("\n");
  const stackLines = lines.slice(firstStackLine);
  let location: Location | undefined;
  for (const line of stackLines) {
    const parsed = stackUtils.parseLine(line);
    if (!parsed || !parsed.file) continue;
    const resolvedFile = path.join(process.cwd(), parsed.file);
    if (!file || resolvedFile === file) {
      location = {
        file: resolvedFile,
        column: parsed.column || 0,
        line: parsed.line || 0,
      };
      break;
    }
  }
  return { message, stackLines, location };
}

function relativeFilePath(config: FullConfig, file: string): string {
  return path.relative(config.rootDir, file) || path.basename(file);
}

export function formatPWError(
  config: FullConfig,
  error: TestError,
  highlightCode: boolean,
  file?: string
) {
  if (!error) {
    return;
  }

  const stack = error.stack;
  const tokens = [];
  let location: Location | undefined;
  if (stack) {
    const parsed = prepareErrorStack(stack, file);
    tokens.push(parsed.message);
    location = parsed.location;
    if (location) {
      try {
        const source = fs.readFileSync(location.file, "utf8");
        const codeFrame = codeFrameColumns(
          source,
          { start: location },
          { highlightCode }
        );
        // Convert /var/folders to /private/var/folders on Mac.
        if (!file || fs.realpathSync(file) !== location.file) {
          tokens.push("");
          tokens.push(
            `   at ` +
              `${relativeFilePath(config, location.file)}:${location.line}`
          );
        }
        tokens.push("");
        tokens.push(codeFrame);
      } catch (e) {
        // Failed to read the source file - that's ok.
      }
    }
    tokens.push("");
    tokens.push(parsed.stackLines.join("\n"));
  } else if (error.message) {
    tokens.push(error.message);
  } else if (error.value) {
    tokens.push(error.value);
  }
  return tokens.join("\n");
}
