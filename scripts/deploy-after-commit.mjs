#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run() {
  if (process.env.CI === "true") {
    console.log("Post-commit deploy omitido en CI.");
    return;
  }

  if (process.env.SKIP_POST_COMMIT_DEPLOY === "1") {
    console.log("Post-commit deploy omitido por SKIP_POST_COMMIT_DEPLOY=1.");
    return;
  }

  console.log("Iniciando deploy automatico post-commit...");

  const result = spawnSync("npx", ["vercel", "deploy", "--prod", "--yes"], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    console.error("El deploy automatico fallo. El commit se conserva sin cambios.");
    process.exitCode = result.status ?? 1;
    return;
  }

  console.log("Deploy automatico finalizado.");
}

run();
