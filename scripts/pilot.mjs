#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { existsSync, mkdirSync } from "node:fs";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "backend");
const frontendDir = path.join(root, "frontend");
const isWindows = process.platform === "win32";

const mode = process.argv[2] ?? "start";
const validModes = new Set(["start", "setup", "check"]);

if (!validModes.has(mode)) {
  console.error(`Unknown mode "${mode}". Use start, setup, or check.`);
  process.exit(1);
}

function commandName(command) {
  return isWindows && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
}

function run(command, args, options = {}) {
  const result = spawnSync(commandName(command), args, {
    cwd: options.cwd ?? root,
    env: process.env,
    stdio: options.stdio ?? "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result;
}

function capture(command, args, options = {}) {
  return spawnSync(commandName(command), args, {
    cwd: options.cwd ?? root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

function findPythonCommand() {
  const candidates = isWindows
    ? [
        ["py", ["-3"]],
        ["python", []],
        ["python3", []],
      ]
    : [
        ["python3", []],
        ["python", []],
      ];

  for (const [command, prefixArgs] of candidates) {
    const result = capture(command, [...prefixArgs, "--version"]);
    if (result.status === 0) {
      return { command, prefixArgs };
    }
  }

  throw new Error("Python 3 was not found. Install Python 3.11+ and rerun this command.");
}

function venvPythonPath() {
  return isWindows
    ? path.join(backendDir, ".venv", "Scripts", "python.exe")
    : path.join(backendDir, ".venv", "bin", "python");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runPython(python, args, options = {}) {
  if (python.prefixArgs) {
    return run(python.command, [...python.prefixArgs, ...args], options);
  }
  return run(python.command, args, options);
}

async function ensureVenv() {
  const venvPython = venvPythonPath();
  if (await fileExists(venvPython)) {
    return { command: venvPython, prefixArgs: [] };
  }

  const python = findPythonCommand();
  runPython(python, ["-m", "venv", path.join(backendDir, ".venv")], { cwd: backendDir });
  return { command: venvPython, prefixArgs: [] };
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port, timeout: 600 });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function promptForProfile() {
  if (!process.stdin.isTTY) {
    return { profile: "local", apiKey: "" };
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question("Configure models for local or remote OpenAI-compatible endpoint? [local] ")
    )
      .trim()
      .toLowerCase();
    const profile = answer === "remote" ? "remote" : "local";
    if (profile === "remote") {
      const apiKey = await rl.question("Remote API key (stored only in backend/storage/app.db): ");
      return { profile, apiKey: apiKey.trim() };
    }
    return { profile, apiKey: "" };
  } finally {
    rl.close();
  }
}

async function setup() {
  mkdirSync(path.join(backendDir, "storage"), { recursive: true });

  run("npm", ["install"], { cwd: root });
  run("npm", ["--prefix", "frontend", "install"], { cwd: root });

  const python = await ensureVenv();
  runPython(python, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: backendDir });
  runPython(python, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: backendDir });

  const { profile, apiKey } = await promptForProfile();
  const bootstrapArgs = ["-m", "app.bootstrap", "--profile", profile];
  if (profile === "remote") {
    if (!apiKey) {
      throw new Error("Remote model profile requires an API key.");
    }
    bootstrapArgs.push("--api-key", apiKey);
  }
  runPython(python, bootstrapArgs, { cwd: backendDir });

  return python;
}

async function check() {
  const pythonCommand = findPythonCommand();
  const ffmpeg = capture("ffmpeg", ["-version"]);
  const backendBusy = await isPortOpen(8765);
  const frontendBusy = await isPortOpen(3000);
  const venvExists = existsSync(venvPythonPath());
  const python = venvExists ? { command: venvPythonPath(), prefixArgs: [] } : pythonCommand;

  console.log(`Platform: ${os.platform()} ${os.release()}`);
  console.log(`Node: ${process.version}`);
  console.log(`Python: ${pythonCommand.command} ${pythonCommand.prefixArgs.join(" ")}`.trim());
  console.log(`ffmpeg: ${ffmpeg.status === 0 ? "found" : "not found (recommended)"}`);
  console.log(`Backend port 8765: ${backendBusy ? "busy" : "available"}`);
  console.log(`Frontend port 3000: ${frontendBusy ? "busy" : "available"}`);
  console.log(`Backend venv: ${venvExists ? "found" : "missing"}`);

  if (venvExists) {
    runPython(python, ["-m", "app.bootstrap", "--check"], { cwd: backendDir });
  }
}

function spawnProcess(label, command, args, options = {}) {
  const child = spawn(commandName(command), args, {
    cwd: options.cwd ?? root,
    env: process.env,
    stdio: "pipe",
    shell: false,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

async function waitForHttp(url, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function start() {
  const python = await setup();
  const children = [
    spawnProcess("BACKEND", python.command, [...python.prefixArgs, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8765"], {
      cwd: backendDir,
    }),
    spawnProcess("WORKER", python.command, [...python.prefixArgs, "-m", "app.worker"], { cwd: backendDir }),
    spawnProcess("NEXT", "npm", ["--prefix", "frontend", "run", "dev"], { cwd: root }),
  ];

  const shutdown = () => {
    for (const child of children) {
      child.kill();
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await waitForHttp("http://127.0.0.1:3000");
  run("npm", ["run", "build:electron"], { cwd: root });
  children.push(spawnProcess("ELECTRON", "npx", ["electron", "."], { cwd: root }));
}

try {
  if (mode === "check") {
    await check();
  } else if (mode === "setup") {
    await setup();
  } else {
    await start();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
