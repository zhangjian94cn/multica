import type { CreateSkillRequest } from "@multica/core/types";

const SKILL_MD = "SKILL.md";
const MAX_FILE_COUNT = 128;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".env",
  ".go",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".py",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const TEXT_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/typescript",
  "application/x-javascript",
  "application/xml",
  "image/svg+xml",
]);

type BrowserDirectoryFile = File & {
  webkitRelativePath?: string;
};

interface NormalizedFile {
  file: BrowserDirectoryFile;
  path: string;
  relativePath: string;
  segments: string[];
}

export interface ParsedLocalSkillFolder {
  key: string;
  name: string;
  originalName: string;
  nameWasAdjusted: boolean;
  description: string;
  content: string;
  files: { path: string; content: string }[];
  rootName: string;
  rootPath: string;
  fileCount: number;
  totalBytes: number;
}

export interface ParsedLocalSkillImport {
  rootName: string;
  skills: ParsedLocalSkillFolder[];
}

export function toCreateSkillRequest(
  parsed: ParsedLocalSkillFolder,
): CreateSkillRequest {
  return {
    name: parsed.name,
    description: parsed.description,
    content: parsed.content,
    files: parsed.files,
  };
}

function uniqueSkillName(
  name: string,
  rootName: string,
  usedNames: Set<string>,
): string {
  if (!usedNames.has(name)) return name;

  const suffix = rootName && rootName !== name ? rootName : "copy";
  const base = `${name} (${suffix})`;
  let candidate = base;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base} ${index}`;
    index += 1;
  }
  return candidate;
}

function filePath(file: BrowserDirectoryFile): string {
  return (file.webkitRelativePath || file.name).replaceAll("\\", "/");
}

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function hasUnsafeSegment(segments: string[]): boolean {
  return segments.some((segment) => segment === "." || segment === "..");
}

function shouldStripCommonRoot(files: NormalizedFile[]): boolean {
  if (files.length === 0) return false;
  const firstRoot = files[0]?.segments[0];
  return Boolean(
    firstRoot &&
      files.every((item) => item.segments.length > 1 && item.segments[0] === firstRoot),
  );
}

function isIgnoredPath(segments: string[]): boolean {
  if (segments.some((segment) => segment.startsWith("."))) return true;
  if (segments.some((segment) => segment === "node_modules")) return true;

  const fileName = segments.at(-1)?.toLowerCase() ?? "";
  return fileName === "license" || fileName === "license.md" || fileName === "license.txt";
}

function pathStartsWith(path: string[], prefix: string[]): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((segment, index) => path[index] === segment);
}

function stripPrefix(path: string[], prefix: string[]): string[] {
  return pathStartsWith(path, prefix) ? path.slice(prefix.length) : path;
}

function dirname(path: string): string {
  const parts = pathSegments(path);
  parts.pop();
  return parts.join("/");
}

function extensionFor(path: string): string {
  const fileName = path.split("/").at(-1) ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function isLikelyTextFile(file: File, relativePath: string): boolean {
  if (relativePath === SKILL_MD) return true;
  if (file.type.startsWith("text/")) return true;
  if (file.type && TEXT_MIME_TYPES.has(file.type)) return true;

  const extension = extensionFor(relativePath);
  if (!extension) return true;
  return TEXT_EXTENSIONS.has(extension);
}

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};

  const result: { name?: string; description?: string } = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!field) continue;
    const key = field[1];
    const value = stripYamlQuotes(field[2] ?? "");
    if (key === "name" && value) result.name = value;
    if (key === "description" && value) result.description = value;
  }
  return result;
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

export async function parseSkillFolderImport(
  input: FileList | File[],
): Promise<ParsedLocalSkillImport> {
  const files = Array.from(input as ArrayLike<BrowserDirectoryFile>);
  if (files.length === 0) {
    throw new Error("Choose a skill folder first.");
  }

  const normalized = files.map((file) => {
    const path = filePath(file);
    const segments = pathSegments(path);
    if (segments.length === 0 || hasUnsafeSegment(segments)) {
      throw new Error("The selected folder contains an invalid file path.");
    }
    return {
      file,
      path,
      relativePath: path,
      segments,
    };
  });

  const stripRoot = shouldStripCommonRoot(normalized);
  const rootName = stripRoot ? normalized[0]!.segments[0]! : "";
  const importableFiles = normalized
    .map((item) => {
      const segments = stripRoot ? item.segments.slice(1) : item.segments;
      const relativePath = segments.join("/");
      return {
        ...item,
        relativePath,
        segments,
      };
    })
    .filter((item) => item.relativePath && !isIgnoredPath(item.segments));

  const skillRoots = importableFiles
    .filter((item) => item.relativePath === SKILL_MD || item.relativePath.endsWith(`/${SKILL_MD}`))
    .map((item) => ({
      file: item,
      rootPath: dirname(item.relativePath),
      rootSegments: pathSegments(dirname(item.relativePath)),
    }))
    .sort((a, b) => a.rootPath.localeCompare(b.rootPath));

  if (skillRoots.length === 0) {
    throw new Error("No importable skills found. Choose a folder that contains SKILL.md files.");
  }

  const parsedSkills = await Promise.all(
    skillRoots.map(async (root) => {
      const skillFiles = importableFiles.filter((item) => {
        if (!pathStartsWith(item.segments, root.rootSegments)) return false;

        return !skillRoots.some((other) => {
          if (other.rootPath === root.rootPath) return false;
          if (!pathStartsWith(other.rootSegments, root.rootSegments)) return false;
          if (other.rootSegments.length <= root.rootSegments.length) return false;
          return pathStartsWith(item.segments, other.rootSegments);
        });
      });

      const textFiles = skillFiles
        .map((item) => {
          const relativeSegments = stripPrefix(item.segments, root.rootSegments);
          return {
            ...item,
            skillRelativePath: relativeSegments.join("/"),
          };
        })
        .filter((item) => isLikelyTextFile(item.file, item.skillRelativePath));

      if (!textFiles.some((item) => item.skillRelativePath === SKILL_MD)) {
        throw new Error("Choose a skill folder that contains SKILL.md.");
      }

      if (textFiles.length > MAX_FILE_COUNT) {
        throw new Error("This skill folder is too large. Keep it under 128 files.");
      }

      let totalBytes = 0;
      for (const item of textFiles) {
        if (item.file.size > MAX_FILE_BYTES) {
          throw new Error("Each skill file must be 1MB or smaller.");
        }
        totalBytes += item.file.size;
      }
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("This skill folder is too large. Keep it under 8MB total.");
      }

      const skillMd = textFiles.find((item) => item.skillRelativePath === SKILL_MD)!;
      const content = await readFileText(skillMd.file);
      const supportingFiles = await Promise.all(
        textFiles
          .filter((item) => item.skillRelativePath !== SKILL_MD)
          .sort((a, b) => a.skillRelativePath.localeCompare(b.skillRelativePath))
          .map(async (item) => ({
            path: item.skillRelativePath,
            content: await readFileText(item.file),
          })),
      );
      const frontmatter = parseSkillFrontmatter(content);
      const skillRootName =
        (root.rootSegments.at(-1) ?? rootName) ||
        frontmatter.name ||
        "Selected folder";
      const originalName = frontmatter.name || skillRootName || "Untitled Skill";

      return {
        key: root.rootPath || ".",
        name: originalName,
        originalName,
        nameWasAdjusted: false,
        description: frontmatter.description ?? "",
        content,
        files: supportingFiles,
        rootName: skillRootName,
        rootPath: root.rootPath || ".",
        fileCount: textFiles.length,
        totalBytes,
      };
    }),
  );

  const usedNames = new Set<string>();
  const skills = parsedSkills.map((skill) => {
    const name = uniqueSkillName(skill.name, skill.rootName, usedNames);
    usedNames.add(name);
    return {
      ...skill,
      name,
      nameWasAdjusted: name !== skill.originalName,
    };
  });

  return {
    rootName: rootName || skills[0]?.rootName || "Selected folder",
    skills,
  };
}

export async function parseSkillFolderFiles(
  input: FileList | File[],
): Promise<ParsedLocalSkillFolder> {
  const result = await parseSkillFolderImport(input);
  if (result.skills.length !== 1) {
    throw new Error("Choose one specific skill folder, not a parent folder with multiple SKILL.md files.");
  }

  return result.skills[0]!;
}
