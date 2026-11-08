import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, sep } from "node:path";

const requiredFiles = [
  "README.md",
  "README.zh-CN.md",
  "LICENSE",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "SUPPORT.md",
  "docs/ARCHITECTURE.md",
  "docs/DEPENDENCIES.md",
  ".github/workflows/ci.yml",
  "main.js",
  "manifest.json",
  "package-lock.json",
  "styles.css",
  "versions.json",
];

const packageJson = await readJson("package.json");
const manifest = await readJson("manifest.json");
const versions = await readJson("versions.json");
const failures = [];

check(
  packageJson.version === manifest.version,
  `package.json version ${packageJson.version} does not match manifest.json ${manifest.version}.`,
);
check(packageJson.license === "MIT", "package.json license must be MIT.");
check(
  packageJson.private === true,
  "package.json must remain private to prevent accidental npm publication.",
);
check(
  packageJson.author === manifest.author,
  "package.json and manifest.json must use the same author.",
);
check(
  /^\d+\.\d+\.\d+$/.test(manifest.version),
  "manifest version must use x.y.z semantic versioning.",
);
check(
  versions[manifest.version] === manifest.minAppVersion,
  `versions.json must map ${manifest.version} to ${manifest.minAppVersion}.`,
);
check(
  /^[a-z][a-z-]*[a-z]$/.test(manifest.id) &&
    !manifest.id.includes("obsidian") &&
    !manifest.id.endsWith("plugin"),
  "manifest id must follow the Obsidian community directory rules.",
);
check(
  typeof manifest.description === "string" &&
    manifest.description.length <= 250 &&
    manifest.description.endsWith("."),
  "manifest description must be at most 250 characters and end with a period.",
);
check(
  typeof manifest.isDesktopOnly === "boolean",
  "manifest isDesktopOnly must be a boolean.",
);

for (const path of requiredFiles) {
  try {
    const info = await stat(path);
    check(info.isFile() && info.size > 0, `${path} must be a non-empty file.`);
  } catch {
    failures.push(`${path} is missing.`);
  }
}

const repositoryTextFiles = await listRepositoryTextFiles(".");
const forbiddenMachinePaths = [
  {
    label: "macOS home directory",
    expression: new RegExp("/" + "Users/" + "[A-Za-z0-9._-]+/"),
  },
  {
    label: "Linux home directory",
    expression: new RegExp("/" + "home/" + "[A-Za-z0-9._-]+/"),
  },
  {
    label: "Windows user directory",
    expression: new RegExp(
      "[A-Za-z]:[\\\\/]+" + "Users[\\\\/]+" + "[A-Za-z0-9._-]+[\\\\/]",
    ),
  },
];

for (const path of repositoryTextFiles) {
  const contents = await readFile(path, "utf8");
  for (const { label, expression } of forbiddenMachinePaths) {
    check(
      !expression.test(contents),
      `${path} contains a machine-specific ${label}; use a repository-relative path.`,
    );
  }

  if (extname(path) === ".md") {
    await verifyLocalMarkdownLinks(path, contents);
  }

  if ([".js", ".mjs", ".ts"].includes(extname(path))) {
    check(
      !/\b(?:from\s+|import\s*\(|require\s*\()\s*["'](?:\/|file:|[A-Za-z]:[\\/])/.test(
        contents,
      ),
      `${path} contains an absolute code import; use a repository-relative import.`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write("Release verification failed:\n");
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Release verification passed for Target Copy ${manifest.version}.\n`,
  );
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listRepositoryTextFiles(directory) {
  const ignoredDirectories = new Set([
    ".git",
    ".cache",
    ".tmp",
    "build",
    "coverage",
    "dist",
    "node_modules",
  ]);
  const textExtensions = new Set([
    ".css",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".ts",
    ".yaml",
    ".yml",
  ]);
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRepositoryTextFiles(path)));
    } else if (
      entry.isFile() &&
      (textExtensions.has(extname(entry.name)) || entry.name === ".gitignore")
    ) {
      files.push(path.split(sep).join("/"));
    }
  }

  return files;
}

async function verifyLocalMarkdownLinks(sourcePath, contents) {
  const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of contents.matchAll(markdownLink)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (
      rawTarget.startsWith("#") ||
      /^(?:https?:|mailto:)/i.test(rawTarget)
    ) {
      continue;
    }

    const targetWithoutAnchor = rawTarget.split("#", 1)[0];
    if (!targetWithoutAnchor) continue;

    check(
      !isAbsolute(targetWithoutAnchor),
      `${sourcePath} must use a repository-relative link: ${rawTarget}.`,
    );

    try {
      const targetPath = join(
        dirname(sourcePath),
        decodeURIComponent(targetWithoutAnchor),
      );
      await stat(targetPath);
    } catch {
      failures.push(`${sourcePath} contains a broken local link: ${rawTarget}.`);
    }
  }
}
