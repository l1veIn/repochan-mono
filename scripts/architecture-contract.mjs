import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const packageContracts = Object.freeze({
  core: [], skill: [], "image-gen": [], "image-edit": [], templates: [], starters: [],
  browse: ["@repochan/core"],
  cli: ["@repochan/core", "@repochan/skill", "@repochan/image-gen", "@repochan/image-edit", "@repochan/templates", "@repochan/browse"],
});

function packageName(specifier) {
  if (specifier === "repochan") return specifier;
  return specifier.startsWith("@repochan/") ? specifier.split("/").slice(0, 2).join("/") : undefined;
}

export function internalImportSites(source, filename = "source.ts") {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  const factories = new Set();
  const moduleNamespaces = new Set();
  const requireNames = new Set(["require"]);
  function traverse(node, visitor) { visitor(node); ts.forEachChild(node, (child) => traverse(child, visitor)); }
  traverse(tree, (node) => {
    if (!ts.isImportDeclaration(node) || !["node:module", "module"].includes(node.moduleSpecifier.text)) return;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const item of bindings.elements) if ((item.propertyName?.text ?? item.name.text) === "createRequire") factories.add(item.name.text);
    } else if (bindings && ts.isNamespaceImport(bindings)) moduleNamespaces.add(bindings.name.text);
  });
  function isFactory(expression) {
    return (ts.isIdentifier(expression) && factories.has(expression.text)) ||
      (ts.isPropertyAccessExpression(expression) && expression.name.text === "createRequire" &&
        ts.isIdentifier(expression.expression) && moduleNamespaces.has(expression.expression.text));
  }
  traverse(tree, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
        ts.isCallExpression(node.initializer) && isFactory(node.initializer.expression)) requireNames.add(node.name.text);
  });
  function record(node, kind = "import") {
    if (node && ts.isStringLiteralLike(node) && (packageName(node.text) || node.text.startsWith("."))) imports.push({ specifier: node.text, kind });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) record(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) record(node.moduleReference.expression);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) record(node.argument.literal);
    const resolveCall = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "resolve" &&
      ts.isIdentifier(node.expression.expression) && requireNames.has(node.expression.expression.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && requireNames.has(node.expression.text)) ||
        resolveCall ||
        (ts.isCallExpression(node.expression) && isFactory(node.expression.expression)))) record(node.arguments[0], resolveCall ? "resolve" : "import");
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return imports;
}

export function internalImports(source, filename = "source.ts") {
  return internalImportSites(source, filename).map(({ specifier }) => specifier);
}

/** The optional development catalog probe is metadata resolution, not a runtime dependency. */
export function permittedDevelopmentProbe(file, site) {
  return file === "packages/cli/src/lib/starter-loader.ts" && site.kind === "resolve" && site.specifier === "@repochan/starters/package.json";
}

export function manifestViolations(directory, manifest) {
  const allowed = packageContracts[directory];
  const findings = [];
  if (!allowed) throw new Error(`Unknown package contract: ${directory}`);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const dependency of Object.keys(manifest[field] ?? {})) {
      if (packageName(dependency) && !allowed.includes(dependency)) findings.push(`forbidden ${field}: ${dependency}`);
    }
  }
  if (directory === "cli") {
    if (manifest.name !== "repochan" || Object.keys(manifest.bin ?? {}).join() !== "repochan") findings.push("CLI must publish only the repochan bin");
  } else if (manifest.bin) findings.push("only CLI may publish a bin");
  if (["skill", "templates", "starters"].includes(directory) && (manifest.exports || manifest.main || manifest.module)) findings.push("data packages must not expose runtime code");
  return findings;
}

export async function checkArchitecture(root) {
  const findings = [];
  for (const entry of await fs.readdir(path.join(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || Object.hasOwn(packageContracts, entry.name)) continue;
    const file = `packages/${entry.name}/package.json`;
    const manifest = await fs.readFile(path.join(root, file), "utf8").catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (manifest !== undefined) findings.push({ file, reason: "workspace package has no registered architecture contract" });
  }
  for (const [directory, allowed] of Object.entries(packageContracts)) {
    const base = path.join(root, "packages", directory);
    const manifest = JSON.parse(await fs.readFile(path.join(base, "package.json"), "utf8"));
    for (const reason of manifestViolations(directory, manifest)) findings.push({ file: `packages/${directory}/package.json`, reason });
    const runtime = new Set(["dependencies", "optionalDependencies", "peerDependencies"].flatMap((field) => Object.keys(manifest[field] ?? {})));
    async function walk(dir) {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      for (const entry of entries) {
        const filename = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(filename);
        else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) {
          const file = path.relative(root, filename).split(path.sep).join("/");
          for (const site of internalImportSites(await fs.readFile(filename, "utf8"), filename)) {
            if (permittedDevelopmentProbe(file, site)) continue;
            const { specifier } = site;
            const dependency = packageName(specifier);
            if (!dependency) {
              const imported = path.resolve(path.dirname(filename), specifier);
              const packageRoot = path.relative(path.join(root, "packages"), imported).split(path.sep)[0];
              if (packageContracts[packageRoot] && packageRoot !== directory) findings.push({ file, reason: `cross-package relative import: ${specifier}; use the declared package API` });
            } else if (!allowed.includes(dependency)) findings.push({ file, reason: `forbidden internal import: ${specifier}` });
            else if (!runtime.has(dependency)) findings.push({ file, reason: `undeclared runtime dependency: ${dependency}` });
          }
        }
      }
    }
    await walk(path.join(base, "src"));
  }
  return findings;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = await checkArchitecture(root);
  for (const { file, reason } of findings) console.error(`${file}: ${reason}`);
  if (findings.length) process.exitCode = 1;
  else console.log("Package dependency direction and sole CLI binding passed.");
}
