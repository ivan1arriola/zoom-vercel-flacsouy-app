#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();

const INCLUDE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".css",
  ".yml",
  ".yaml"
]);

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel"
]);

const mojibakePattern = /(\u00C3.|\u00C2.)/;

let gitIgnoreEnabled = null;
const gitIgnoreCache = new Map();

function toRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

async function canUseGitIgnore() {
  if (gitIgnoreEnabled !== null) {
    return gitIgnoreEnabled;
  }

  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: ROOT
    });
    gitIgnoreEnabled = true;
  } catch {
    gitIgnoreEnabled = false;
  }

  return gitIgnoreEnabled;
}

async function isGitIgnored(targetPath, isDirectory = false) {
  const relativePath = toRelative(targetPath);
  const key = `${relativePath}::${isDirectory ? "dir" : "file"}`;

  if (gitIgnoreCache.has(key)) {
    return gitIgnoreCache.get(key);
  }

  if (!(await canUseGitIgnore())) {
    gitIgnoreCache.set(key, false);
    return false;
  }

  const candidate = isDirectory ? `${relativePath}/` : relativePath;

  try {
    await execFileAsync("git", ["check-ignore", "-q", candidate], {
      cwd: ROOT
    });

    gitIgnoreCache.set(key, true);
    return true;
  } catch (error) {
    const ignored = error && typeof error.code === "number" && error.code === 1
      ? false
      : false;

    gitIgnoreCache.set(key, ignored);
    return ignored;
  }
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }

      if (await isGitIgnored(fullPath, true)) {
        continue;
      }

      out.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (await isGitIgnored(fullPath, false)) {
      continue;
    }

    if (INCLUDE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }

  return out;
}

async function main() {
  const files = await collectFiles(ROOT);
  const bomFiles = [];
  const mojibakeFiles = [];

  for (const file of files) {
    const buffer = await fs.readFile(file);

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      bomFiles.push(toRelative(file));
    }

    const text = buffer.toString("utf8");
    if (text.includes("\uFFFD") || mojibakePattern.test(text)) {
      mojibakeFiles.push(toRelative(file));
    }
  }

  if (!bomFiles.length && !mojibakeFiles.length) {
    console.log("Encoding OK: no se detectaron BOM ni mojibake.");
    return;
  }

  console.error("Se detectaron problemas de encoding:");

  if (bomFiles.length) {
    console.error("- Archivos con BOM UTF-8:");
    for (const file of bomFiles) {
      console.error(`  - ${file}`);
    }
  }

  if (mojibakeFiles.length) {
    console.error("- Archivos con posible mojibake:");
    for (const file of mojibakeFiles) {
      console.error(`  - ${file}`);
    }
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Fallo ejecutando check:encoding", error);
  process.exitCode = 1;
});