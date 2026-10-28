// Imports a TypeScript module (and the relative modules it imports) for unit tests.
// Each file is transpiled into node_modules/.cache/ts-tests/<pid>/ with its relative imports pointed at the
// transpiled copies, so bare imports (drizzle-orm, …) still resolve from the project's node_modules.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const outDir = path.join(root, "node_modules", ".cache", "ts-tests", String(process.pid));
const done = new Set();
process.on("exit", () => rmSync(outDir, { recursive: true, force: true }));

function resolveSource(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (candidate.endsWith(".ts") || candidate.endsWith(".tsx")) {
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`Cannot resolve ${specifier} from ${fromFile}`);
}

function outPath(sourceFile) {
  return path.join(outDir, path.relative(root, sourceFile)).replace(/\.tsx?$/, ".mjs");
}

function emit(sourceFile) {
  if (done.has(sourceFile)) return;
  done.add(sourceFile);
  const { outputText } = ts.transpileModule(readFileSync(sourceFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const target = outPath(sourceFile);
  const rewritten = outputText.replace(/(from\s+|import\s*\(\s*)(["'])(\.{1,2}(?:\/[^"']*)?)\2/g, (_, lead, quote, specifier) => {
    const dependency = resolveSource(sourceFile, specifier);
    emit(dependency);
    let relative = path.relative(path.dirname(target), outPath(dependency)).split(path.sep).join("/");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    return `${lead}${quote}${relative}${quote}`;
  });
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, rewritten);
}

/** `relativePath` is from the project root, e.g. "db/clickup-snapshot.ts". */
export async function importTs(relativePath) {
  const sourceFile = path.join(root, relativePath);
  emit(sourceFile);
  return import(pathToFileURL(outPath(sourceFile)).href);
}
