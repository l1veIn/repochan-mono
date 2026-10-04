import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Markdown references outside examples, including images, HTML, and reference-style links. */
export function documentLinks(source) {
  const visible = source
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, (block) => "\n".repeat(block.split("\n").length - 1))
    .replace(/`[^`\n]*`/g, "");
  const links = [];
  const pattern = /\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)|\b(src|srcset|href)=["']([^"']+)["']|^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm;
  for (const match of visible.matchAll(pattern)) {
    const value = match[1] ?? match[3] ?? match[4];
    // Each srcset candidate has a URL followed by optional width/density descriptors.
    // A data URL can contain commas; consume its whole non-whitespace URL first.
    const targets = match[2] === "srcset"
      ? [...value.matchAll(/(?:^|,\s*)(\S+?)(?:\s+[^,]*|(?=,\s|$))/g)].map((candidate) => candidate[1])
      : [value];
    for (const target of targets) links.push({ target: target.replace(/^<|>$/g, ""), line: visible.slice(0, match.index).split("\n").length });
  }
  return links;
}

async function sourceInventory(root) {
  try {
    const output = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return new Set(output.split("\0").filter(Boolean));
  } catch {
    // Release clean-room sources contain only the copied source inventory, without .git.
    const files = new Set();
    async function walk(dir = "") {
      for (const entry of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
        const relative = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!["node_modules", "dist", ".git", ".astro", ".repochan", "test-results", "coverage"].includes(entry.name)) await walk(relative);
        } else files.add(relative);
      }
    }
    await walk();
    return files;
  }
}

export async function checkDocumentation(root, inventory) {
  const files = inventory ?? await sourceInventory(root);
  const findings = [];
  for (const file of [...files].filter((name) => name.endsWith(".md")).sort()) {
    let source;
    try { source = await fs.readFile(path.join(root, file), "utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const { target, line } of documentLinks(source)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
      const pathname = target.split(/[?#]/, 1)[0];
      if (!pathname) continue;
      let decoded;
      try { decoded = decodeURIComponent(pathname); }
      catch { findings.push({ file, line, target, reason: "invalid URL encoding" }); continue; }
      const absolute = path.resolve(root, path.dirname(file), decoded);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
        findings.push({ file, line, target, reason: "outside repository" });
        continue;
      }
      const isFile = files.has(relative);
      const isDirectory = !relative || [...files].some((name) => name.startsWith(`${relative}/`));
      if (!isFile && !isDirectory) findings.push({ file, line, target, reason: "missing from source inventory" });
      else {
        const stat = await fs.stat(absolute).catch((error) => { if (error.code === "ENOENT") return undefined; throw error; });
        if (!stat || (!stat.isFile() && !stat.isDirectory())) findings.push({ file, line, target, reason: "missing on disk" });
      }

      // Installed skills only receive the skills tree, not the surrounding repository.
      const skillRoot = "packages/skill/skills/";
      if (file.startsWith(skillRoot) && !relative.startsWith(skillRoot)) {
        findings.push({ file, line, target, reason: "not available in installed skills" });
      }
    }
  }
  return findings;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = await checkDocumentation(root);
  for (const finding of findings) console.error(`${finding.file}:${finding.line}: ${finding.target} — ${finding.reason}`);
  if (findings.length) process.exitCode = 1;
  else console.log("Documentation links and installed-skill references passed.");
}
