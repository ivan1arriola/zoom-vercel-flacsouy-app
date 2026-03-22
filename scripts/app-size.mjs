import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".vercel",
  ".git",
  "dist",
  "build",
  "coverage",
  "out",
  ".turbo"
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.tsbuildinfo"
]);

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function countLines(content) {
  if (!content) return 0;
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n").length;
}

function isLikelyTextFile(filePath) {
  const textExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".css",
    ".scss",
    ".sass",
    ".md",
    ".txt",
    ".env",
    ".prisma",
    ".html",
    ".xml",
    ".yml",
    ".yaml",
    ".svg"
  ]);

  const fileName = path.basename(filePath);
  if (fileName.startsWith(".env")) return true;
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function isLikelyCodeFile(filePath) {
  const codeExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".css",
    ".scss",
    ".sass",
    ".prisma"
  ]);

  return codeExtensions.has(path.extname(filePath).toLowerCase());
}

function countMatches(content, regex) {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function computeHeuristicMetrics(content) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0).length;
  const longLines = lines.filter((line) => line.length > 120).length;
  const maxLineLength = lines.reduce((max, line) => (line.length > max ? line.length : max), 0);
  const flowKeywords = countMatches(normalized, /\b(if|else\s+if|for|while|switch|case|catch|try)\b/g);
  const logicalOps = countMatches(normalized, /&&|\|\||\?/g);
  const todoNotes = countMatches(
    normalized,
    /(^\s*\/\/.*\b(TODO|FIXME|HACK|XXX)\b)|(^\s*#.*\b(TODO|FIXME|HACK|XXX)\b)|(^\s*\/\*.*\b(TODO|FIXME|HACK|XXX)\b)/gim
  );
  const functionDefs = countMatches(
    normalized,
    /\bfunction\b|=>|\basync\s+function\b|\basync\s*\(/g
  );

  return {
    nonEmptyLines,
    longLines,
    maxLineLength,
    flowKeywords,
    logicalOps,
    todoNotes,
    functionDefs,
    complexityProxy: flowKeywords + logicalOps
  };
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function computeRefactorScore(file) {
  const sizeFactor = clamp01(file.bytes / 20000);
  const linesFactor = clamp01(file.lines / 400);
  const complexityFactor = clamp01((file.metrics?.complexityProxy || 0) / 80);
  const longLinesFactor = clamp01((file.metrics?.longLines || 0) / 30);
  const todoFactor = clamp01((file.metrics?.todoNotes || 0) / 5);

  const score =
    sizeFactor * 25 +
    linesFactor * 35 +
    complexityFactor * 25 +
    longLinesFactor * 10 +
    todoFactor * 5;

  const reasons = [];
  if (file.lines >= 300) reasons.push(`${file.lines} lineas`);
  if (file.bytes >= 15000) reasons.push(`${formatBytes(file.bytes)} de tamano`);
  if ((file.metrics?.complexityProxy || 0) >= 35) {
    reasons.push(`${file.metrics.complexityProxy} puntos de complejidad aprox`);
  }
  if ((file.metrics?.longLines || 0) >= 8) reasons.push(`${file.metrics.longLines} lineas largas (>120)`);
  if ((file.metrics?.todoNotes || 0) > 0) reasons.push(`${file.metrics.todoNotes} notas TODO/FIXME`);

  return {
    score,
    reasons
  };
}

async function walk(dir, relativeBase = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  let totalBytes = 0;
  let totalLines = 0;
  const byTopLevel = new Map();
  const linesByTopLevel = new Map();
  const files = [];

  for (const entry of entries) {
    const entryName = entry.name;
    const relativePath = relativeBase ? path.join(relativeBase, entryName) : entryName;
    const fullPath = path.join(dir, entryName);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entryName)) continue;

      const nested = await walk(fullPath, relativePath);
      totalBytes += nested.totalBytes;
      totalLines += nested.totalLines;

      for (const [topLevel, size] of nested.byTopLevel.entries()) {
        byTopLevel.set(topLevel, (byTopLevel.get(topLevel) || 0) + size);
      }

      for (const [topLevel, lines] of nested.linesByTopLevel.entries()) {
        linesByTopLevel.set(topLevel, (linesByTopLevel.get(topLevel) || 0) + lines);
      }

      files.push(...nested.files);

      continue;
    }

    if (!entry.isFile()) continue;
    if (IGNORED_FILES.has(entryName)) continue;

    const fileStats = await stat(fullPath);
    totalBytes += fileStats.size;
    let lineCount = 0;
    let textContent = "";
    if (isLikelyTextFile(relativePath)) {
      textContent = await readFile(fullPath, "utf8");
      lineCount = countLines(textContent);
    }
    totalLines += lineCount;

    const parts = relativePath.split(path.sep);
    const topLevel = parts.length > 1 ? parts[0] : "(raiz)";
    byTopLevel.set(topLevel, (byTopLevel.get(topLevel) || 0) + fileStats.size);
    linesByTopLevel.set(topLevel, (linesByTopLevel.get(topLevel) || 0) + lineCount);
    const metrics =
      textContent && isLikelyCodeFile(relativePath)
        ? computeHeuristicMetrics(textContent)
        : undefined;

    files.push({ path: relativePath, bytes: fileStats.size, lines: lineCount, metrics });
  }

  return { totalBytes, totalLines, byTopLevel, linesByTopLevel, files };
}

async function main() {
  const { totalBytes, totalLines, byTopLevel, linesByTopLevel, files } = await walk(ROOT_DIR);

  const sortedBySize = [...byTopLevel.entries()].sort((a, b) => b[1] - a[1]);
  const sortedByLines = [...linesByTopLevel.entries()].sort((a, b) => b[1] - a[1]);
  const topFilesBySize = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 20);
  const refactorCandidates = files
    .filter((file) => file.metrics && file.lines > 0)
    .filter((file) => !file.path.startsWith(`scripts${path.sep}`))
    .map((file) => ({
      ...file,
      recommendation: computeRefactorScore(file)
    }))
    .sort((a, b) => b.recommendation.score - a.recommendation.score)
    .slice(0, 12);

  console.log("Tamanio de la aplicacion (sin librerias/build):");
  console.log(`Total: ${formatBytes(totalBytes)} (${totalBytes.toLocaleString("es-UY")} bytes)`);
  console.log(`Lineas totales: ${totalLines.toLocaleString("es-UY")}`);
  console.log("\nDesglose por carpeta de primer nivel:");

  for (const [name, size] of sortedBySize) {
    console.log(`- ${name}: ${formatBytes(size)} (${size.toLocaleString("es-UY")} bytes)`);
  }

  console.log("\nLineas por carpeta de primer nivel:");

  for (const [name, lines] of sortedByLines) {
    console.log(`- ${name}: ${lines.toLocaleString("es-UY")} lineas`);
  }

  console.log("\nTop 20 archivos mas pesados:");

  for (const file of topFilesBySize) {
    console.log(
      `- ${file.path}: ${formatBytes(file.bytes)} (${file.bytes.toLocaleString("es-UY")} bytes, ${file.lines.toLocaleString("es-UY")} lineas)`
    );
  }

  console.log("\nRecomendacion heuristica de refactor (top 12):");

  for (const file of refactorCandidates) {
    const reasonsText =
      file.recommendation.reasons.length > 0
        ? file.recommendation.reasons.join(", ")
        : "tamano y complejidad relativa";

    console.log(
      `- ${file.path}: score ${file.recommendation.score.toFixed(1)}/100 (${reasonsText})`
    );
  }
}

main().catch((error) => {
  console.error("Error al medir tamanio de la app:", error);
  process.exit(1);
});
