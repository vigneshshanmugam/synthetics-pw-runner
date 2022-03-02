#!/usr/bin/env node

import { Command } from "commander";
import { spawn } from "child_process";
import { join, resolve } from "path";
import SonicBoom from "sonic-boom";

const { name, version } = require("../../package.json");
const program = new Command();

program
  .name(`npx ${name}`)
  .description("Synthetics runner using PW")
  .version(version);

program
  .command("test")
  .description("test all synthetic journey files")
  .argument("<files...>", "test files to check")
  .option(
    "--outfd <fd>",
    "specify a file descriptor for logs. Default is stdout",
    parseInt
  )
  .allowUnknownOption(true)
  .action(async (args, opts) => {
    try {
      await runTests(args, opts);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program.parse(process.argv);

type CLIArgs = {
  outfd: string;
};

async function runTests(args: Array<string>, options: CLIArgs) {
  const fd = options.outfd || process.stdout.fd;
  const stream = new SonicBoom({ fd, sync: true, minLength: 1 });
  const pwBin = require.resolve("playwright/cli");

  const pwProcess = spawn(
    "node",
    [
      pwBin,
      "test",
      ...args,
      "--reporter",
      join(__dirname, "..", "reporters", "json"),
    ],
    {
      env: process.env,
      stdio: "pipe",
    }
  );

  const dataListener = (data) => {
    stream.write(data.toString());
  };
  pwProcess.stdout.on("data", dataListener);
  pwProcess.stderr.on("data", dataListener);
}
