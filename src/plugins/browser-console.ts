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

import { BrowserContext, Page } from "@playwright/test";
import { BrowserMessage } from "../common_types";
import { getTimestamp } from "../helpers";

const defaultMessageLimit = 1000;

export class BrowserConsole {
  private messages: BrowserMessage[] = [];
  private pages: Array<Page> = [];

  private consoleEventListener = (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      this.messages.push({
        timestamp: getTimestamp(),
        text: msg.text(),
        type,
      });

      this.enforceMessagesLimit();
    }
  };

  private pageErrorEventListener = (error: Error) => {
    this.messages.push({
      timestamp: getTimestamp(),
      text: error.message,
      type: "error",
      error,
    });

    this.enforceMessagesLimit();
  };

  private enforceMessagesLimit() {
    if (this.messages.length > defaultMessageLimit) {
      this.messages.splice(0, 1);
    }
  }

  private pageListener = (page: Page) => {
    page.on("console", this.consoleEventListener);
    page.on("pageerror", this.pageErrorEventListener);
    this.pages.push(page);
  };

  start(context: BrowserContext) {
    context.on("page", this.pageListener);
  }

  stop(context: BrowserContext) {
    context.off("page", this.pageListener);
    this.pages.map((page) => {
      page.off("console", this.consoleEventListener);
      page.off("pageerror", this.pageErrorEventListener);
    });
    this.pages = [];
    return this.messages;
  }
}
