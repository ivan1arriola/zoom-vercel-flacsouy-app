import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const REPORT_DIR = path.join(ROOT_DIR, "reports");
const REPORT_FILE = path.join(REPORT_DIR, "health-report.json");

function parseCliThresholds(argv) {
  const args = new Map();

  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const [key, rawValue] = item.slice(2).split("=");
    if (!key) continue;
    args.set(key, rawValue ?? "true");
  }

  const toNumber = (value, fallback) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const ciMode = args.get("ci") === "true";

  return {
    ciMode,
    maxAverageRisk: toNumber(args.get("max-average-risk"), ciMode ? 30 : undefined),
    maxHighRiskFiles: toNumber(args.get("max-high-risk-files"), ciMode ? 4 : undefined),
    maxMediumRiskFiles: toNumber(args.get("max-medium-risk-files"), ciMode ? 8 : undefined)
  };
}

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

const CODE_EXTENSIONS = new Set([
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

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function countMatches(content, regex) {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function countLines(content) {
  if (!content) return 0;
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split("\n").length;
}

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

function computeMetrics(content) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  const longLines = lines.filter((line) => line.length > 120).length;
  const complexityFlow = countMatches(normalized, /\b(if|else\s+if|for|while|switch|case|catch|try)\b/g);
  const complexityOps = countMatches(normalized, /&&|\|\||\?/g);
  const todoNotes = countMatches(
    normalized,
    /(^\s*\/\/.*\b(TODO|FIXME|HACK|XXX)\b)|(^\s*#.*\b(TODO|FIXME|HACK|XXX)\b)|(^\s*\/\*.*\b(TODO|FIXME|HACK|XXX)\b)/gim
  );

  return {
    lines: countLines(normalized),
    longLines,
    complexityProxy: complexityFlow + complexityOps,
    todoNotes
  };
}

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isTestFile(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.includes("__tests__") ||
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.endsWith("test.ts") ||
    lower.endsWith("test.tsx")
  );
}

function getCriticality(pathName) {
  const lower = pathName.toLowerCase();
  if (lower.includes("auth")) return 1.0;
  if (lower.includes("middleware")) return 0.9;
  if (lower.includes("api")) return 0.85;
  if (lower.includes("prisma")) return 0.75;
  if (lower.includes("src/modules")) return 0.75;
  if (lower.includes("components")) return 0.55;
  return 0.4;
}

function findTestPair(filePath, allPathsSet) {
  const parsed = path.parse(filePath);
  const dir = parsed.dir;
  const name = parsed.name;
  const ext = parsed.ext;

  const candidates = [
    path.join(dir, `${name}.test${ext}`),
    path.join(dir, `${name}.spec${ext}`),
    path.join(dir, "__tests__", `${name}.test${ext}`),
    path.join(dir, "__tests__", `${name}.spec${ext}`),
    path.join(dir, "__tests__", `${name}.test.ts`),
    path.join(dir, "__tests__", `${name}.spec.ts`),
    path.join(dir, "__tests__", `${name}.test.tsx`),
    path.join(dir, "__tests__", `${name}.spec.tsx`)
  ];

  for (const candidate of candidates) {
    if (allPathsSet.has(candidate)) return true;
  }

  return false;
}

function computeRefactorRecommendation(file, hasTest) {
  const criticality = getCriticality(file.path);

  const sizeFactor = clamp01(file.bytes / 20000);
  const linesFactor = clamp01(file.metrics.lines / 400);
  const complexityFactor = clamp01(file.metrics.complexityProxy / 90);
  const longLinesFactor = clamp01(file.metrics.longLines / 25);
  const todoFactor = clamp01(file.metrics.todoNotes / 3);

  const missingTestsPenalty = !hasTest && file.metrics.lines >= 140 ? 0.12 : 0;

  const score =
    sizeFactor * 20 +
    linesFactor * 25 +
    complexityFactor * 25 +
    longLinesFactor * 10 +
    todoFactor * 5 +
    criticality * 15 +
    missingTestsPenalty * 100;

  const normalizedScore = Math.min(100, Number(score.toFixed(1)));

  const reasons = [];
  if (file.metrics.lines >= 350) reasons.push(`${file.metrics.lines} lineas`);
  if (file.bytes >= 15000) reasons.push(`${formatBytes(file.bytes)} de tamano`);
  if (file.metrics.complexityProxy >= 40) {
    reasons.push(`${file.metrics.complexityProxy} puntos de complejidad aprox`);
  }
  if (file.metrics.longLines >= 8) reasons.push(`${file.metrics.longLines} lineas largas`);
  if (file.metrics.todoNotes > 0) reasons.push(`${file.metrics.todoNotes} TODO/FIXME`);
  if (!hasTest && file.metrics.lines >= 140) reasons.push("sin test cercano");

  let suggestedAction = "Revisar cohesion y extraer pequenas unidades reutilizables.";
  if (file.metrics.lines >= 800) {
    suggestedAction = "Dividir en modulos/funciones y separar responsabilidades por dominio.";
  } else if (file.metrics.complexityProxy >= 90) {
    suggestedAction = "Reducir ramas condicionales; extraer estrategias y funciones puras.";
  } else if (!hasTest && file.metrics.lines >= 140) {
    suggestedAction = "Agregar tests de caracterizacion antes de refactor para reducir riesgo.";
  }

  let effort = "S";
  if (normalizedScore >= 70) effort = "L";
  else if (normalizedScore >= 40) effort = "M";

  const impact = criticality >= 0.85 ? "alto" : criticality >= 0.6 ? "medio" : "bajo";

  return {
    score: normalizedScore,
    effort,
    impact,
    reasons,
    suggestedAction,
    hasTest,
    criticality
  };
}

async function collectFiles(dir, relativeBase = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    const entryName = entry.name;
    const relativePath = relativeBase ? path.join(relativeBase, entryName) : entryName;
    const fullPath = path.join(dir, entryName);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entryName)) continue;
      const nested = await collectFiles(fullPath, relativePath);
      result.push(...nested);
      continue;
    }

    if (!entry.isFile()) continue;
    if (IGNORED_FILES.has(entryName)) continue;

    result.push({ fullPath, path: relativePath });
  }

  return result;
}

async function main() {
  const thresholds = parseCliThresholds(process.argv.slice(2));
  const files = await collectFiles(ROOT_DIR);
  const pathSet = new Set(files.map((file) => file.path));

  const codeFiles = [];

  for (const file of files) {
    if (!isCodeFile(file.path)) continue;
    if (isTestFile(file.path)) continue;

    const fileStats = await stat(file.fullPath);
    const content = await readFile(file.fullPath, "utf8");
    const metrics = computeMetrics(content);
    const hasTest = findTestPair(file.path, pathSet);

    codeFiles.push({
      path: file.path,
      bytes: fileStats.size,
      metrics,
      recommendation: computeRefactorRecommendation({ path: file.path, bytes: fileStats.size, metrics }, hasTest)
    });
  }

  const ranked = codeFiles
    .filter((file) => !file.path.startsWith(`scripts${path.sep}`))
    .sort((a, b) => b.recommendation.score - a.recommendation.score);

  const topRecommendations = ranked.slice(0, 12);

  const averageRisk =
    ranked.length > 0
      ? Number((ranked.reduce((acc, file) => acc + file.recommendation.score, 0) / ranked.length).toFixed(1))
      : 0;

  const summary = {
    generatedAt: new Date().toISOString(),
    scannedCodeFiles: ranked.length,
    averageRisk,
    highRiskFiles: ranked.filter((file) => file.recommendation.score >= 70).length,
    mediumRiskFiles: ranked.filter((file) => file.recommendation.score >= 40 && file.recommendation.score < 70).length,
    lowRiskFiles: ranked.filter((file) => file.recommendation.score < 40).length
  };

  const report = {
    summary,
    thresholds,
    recommendations: topRecommendations.map((file) => ({
      file: file.path,
      score: file.recommendation.score,
      impact: file.recommendation.impact,
      effort: file.recommendation.effort,
      lines: file.metrics.lines,
      bytes: file.bytes,
      reasons: file.recommendation.reasons,
      suggestedAction: file.recommendation.suggestedAction,
      hasTest: file.recommendation.hasTest
    }))
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("Analisis de salud tecnica (heuristico)");
  console.log(`- Archivos analizados: ${summary.scannedCodeFiles}`);
  console.log(`- Riesgo promedio: ${summary.averageRisk}/100`);
  console.log(`- Riesgo alto (>=70): ${summary.highRiskFiles}`);
  console.log(`- Riesgo medio (40-69): ${summary.mediumRiskFiles}`);
  console.log(`- Riesgo bajo (<40): ${summary.lowRiskFiles}`);
  console.log("\nTop recomendaciones de refactor:");

  for (const rec of report.recommendations) {
    const reasonsText = rec.reasons.length > 0 ? rec.reasons.join(", ") : "riesgo relativo";
    console.log(
      `- ${rec.file}: score ${rec.score}/100 | impacto ${rec.impact} | esfuerzo ${rec.effort} | ${reasonsText}`
    );
    console.log(`  Accion: ${rec.suggestedAction}`);
  }

  if (
    thresholds.maxAverageRisk !== undefined ||
    thresholds.maxHighRiskFiles !== undefined ||
    thresholds.maxMediumRiskFiles !== undefined
  ) {
    const breaches = [];

    if (thresholds.maxAverageRisk !== undefined && summary.averageRisk > thresholds.maxAverageRisk) {
      breaches.push(
        `averageRisk ${summary.averageRisk} > maxAverageRisk ${thresholds.maxAverageRisk}`
      );
    }

    if (
      thresholds.maxHighRiskFiles !== undefined &&
      summary.highRiskFiles > thresholds.maxHighRiskFiles
    ) {
      breaches.push(
        `highRiskFiles ${summary.highRiskFiles} > maxHighRiskFiles ${thresholds.maxHighRiskFiles}`
      );
    }

    if (
      thresholds.maxMediumRiskFiles !== undefined &&
      summary.mediumRiskFiles > thresholds.maxMediumRiskFiles
    ) {
      breaches.push(
        `mediumRiskFiles ${summary.mediumRiskFiles} > maxMediumRiskFiles ${thresholds.maxMediumRiskFiles}`
      );
    }

    console.log("\nControl de umbrales CI:");
    if (breaches.length === 0) {
      console.log("- Estado: OK");
      console.log("- Todos los umbrales configurados fueron cumplidos.");
    } else {
      console.log("- Estado: FAIL");
      for (const breach of breaches) {
        console.log(`- ${breach}`);
      }
      console.log("- Ajusta refactors o relaja umbrales para pasar CI.");
      process.exit(2);
    }
  }

  console.log(`\nReporte JSON: ${path.relative(ROOT_DIR, REPORT_FILE)}`);
}

main().catch((error) => {
  console.error("Error en analisis de salud tecnica:", error);
  process.exit(1);
});
