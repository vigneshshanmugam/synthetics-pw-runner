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

import { ChromiumBrowserContext, test } from "@playwright/test";
import { NetworkManager } from "../plugins/network";
import { BrowserConsole } from "../plugins/browser-console";
import { Tracing } from "../plugins/tracing";

type SyntheticsTextFixtures = {
  context: ChromiumBrowserContext;
};

type SyntheticsWorkerFixtures = {
  _plugins: {
    network: NetworkManager;
    browserconsole: BrowserConsole;
    tracing: Tracing;
  };
};

const journey = test.extend<SyntheticsTextFixtures, SyntheticsWorkerFixtures>({
  browserName: [({}, use) => use("chromium"), { scope: "worker" }],
  screenshot: "on",
  _plugins: [
    async ({}, use) => {
      const network = new NetworkManager();
      const browserconsole = new BrowserConsole();
      const tracing = new Tracing();
      await use({ network, browserconsole, tracing });
    },
    { scope: "worker", auto: true },
  ],
  page: async ({ page }, use) => {
    await use(page);
  },
  context: async ({ context, _plugins }, use, testInfo) => {
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await _plugins.network.start(client, context);
    await _plugins.tracing.start(client);
    await _plugins.browserconsole.start(context);
    await use(context);
    const results = _plugins.network.stop(context);
    const messages = await _plugins.browserconsole.stop(context);
    const filmstrips = await _plugins.tracing.stop(client);
    await testInfo.attach("network", { body: JSON.stringify(results) });
    await testInfo.attach("browser_console", {
      body: JSON.stringify(messages),
    });
    await testInfo.attach("filmstrips", { body: JSON.stringify(filmstrips) });
  },
});

// export everything from PW
export * from "@playwright/test";
export { journey, journey as test };
