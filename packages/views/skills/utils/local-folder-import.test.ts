// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { parseSkillFolderImport } from "./local-folder-import";

function folderFile(path: string, content: BlobPart = "", type = "text/plain"): File {
  const file = new File([content], path.split("/").at(-1) ?? "file", { type });
  Object.defineProperty(file, "webkitRelativePath", {
    value: path,
    configurable: true,
  });
  return file;
}

describe("parseSkillFolderImport", () => {
  it("parses a valid single skill folder with frontmatter and supporting files", async () => {
    const result = await parseSkillFolderImport([
      folderFile(
        "content-translator/SKILL.md",
        [
          "---",
          "name: Content Translator",
          "description: Translate and rewrite content",
          "---",
          "# Content Translator",
        ].join("\n"),
        "text/markdown",
      ),
      folderFile("content-translator/docs/prompt.md", "Use this prompt", "text/markdown"),
    ]);

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({
      name: "Content Translator",
      originalName: "Content Translator",
      nameWasAdjusted: false,
      description: "Translate and rewrite content",
      rootName: "content-translator",
      rootPath: ".",
      fileCount: 2,
      files: [{ path: "docs/prompt.md", content: "Use this prompt" }],
    });
    expect(result.skills[0]?.content).toContain("# Content Translator");
  });

  it("rejects folders without any SKILL.md files", async () => {
    await expect(
      parseSkillFolderImport([folderFile("not-a-skill/README.md", "hello")]),
    ).rejects.toThrow(
      "No importable skills found. Choose a folder that contains SKILL.md files.",
    );
  });

  it("parses multiple direct child skill folders", async () => {
    const result = await parseSkillFolderImport([
      folderFile("skills/one/SKILL.md", "---\nname: One\n---\n# One", "text/markdown"),
      folderFile("skills/two/SKILL.md", "---\nname: Two\n---\n# Two", "text/markdown"),
    ]);

    expect(result.skills.map((skill) => skill.name)).toEqual(["One", "Two"]);
    expect(result.skills.map((skill) => skill.rootPath)).toEqual(["one", "two"]);
  });

  it("recursively discovers nested skill folders", async () => {
    const result = await parseSkillFolderImport([
      folderFile("skills/group/nested/SKILL.md", "---\nname: Nested\n---\n# Nested", "text/markdown"),
      folderFile("skills/top/SKILL.md", "---\nname: Top\n---\n# Top", "text/markdown"),
    ]);

    expect(result.skills.map((skill) => skill.name)).toEqual(["Nested", "Top"]);
    expect(result.skills.map((skill) => skill.rootPath)).toEqual(["group/nested", "top"]);
  });

  it("does not include child skill files in a parent skill bundle", async () => {
    const result = await parseSkillFolderImport([
      folderFile("skills/parent/SKILL.md", "---\nname: Parent\n---\n# Parent", "text/markdown"),
      folderFile("skills/parent/README.md", "parent docs", "text/markdown"),
      folderFile("skills/parent/child/SKILL.md", "---\nname: Child\n---\n# Child", "text/markdown"),
      folderFile("skills/parent/child/README.md", "child docs", "text/markdown"),
    ]);

    const parent = result.skills.find((skill) => skill.name === "Parent");
    const child = result.skills.find((skill) => skill.name === "Child");
    expect(parent?.files).toEqual([{ path: "README.md", content: "parent docs" }]);
    expect(child?.files).toEqual([{ path: "README.md", content: "child docs" }]);
  });

  it("ignores hidden files, node_modules, LICENSE files, and binary files", async () => {
    const result = await parseSkillFolderImport([
      folderFile("demo/SKILL.md", "# Demo", "text/markdown"),
      folderFile("demo/.secret.md", "secret", "text/markdown"),
      folderFile("demo/node_modules/pkg/helper.md", "ignored", "text/markdown"),
      folderFile("demo/LICENSE", "license", "text/plain"),
      folderFile("demo/image.png", new Uint8Array([1, 2, 3]), "image/png"),
      folderFile("demo/README.md", "readme", "text/markdown"),
    ]);

    expect(result.skills[0]?.fileCount).toBe(2);
    expect(result.skills[0]?.files).toEqual([{ path: "README.md", content: "readme" }]);
  });

  it("rejects any skill over the file count limit", async () => {
    await expect(
      parseSkillFolderImport([
        folderFile("demo/SKILL.md", "# Demo", "text/markdown"),
        ...Array.from({ length: 128 }, (_, index) =>
          folderFile(`demo/files/${index}.md`, String(index), "text/markdown"),
        ),
      ]),
    ).rejects.toThrow("This skill folder is too large. Keep it under 128 files.");
  });

  it("rejects files over the single-file size limit", async () => {
    await expect(
      parseSkillFolderImport([
        folderFile("demo/SKILL.md", "# Demo", "text/markdown"),
        folderFile("demo/big.md", new Uint8Array(1024 * 1024 + 1), "text/markdown"),
      ]),
    ).rejects.toThrow("Each skill file must be 1MB or smaller.");
  });

  it("rejects folders over the total size limit", async () => {
    await expect(
      parseSkillFolderImport([
        folderFile("demo/SKILL.md", "# Demo", "text/markdown"),
        ...Array.from({ length: 9 }, (_, index) =>
          folderFile(`demo/files/${index}.md`, new Uint8Array(1024 * 1024), "text/markdown"),
        ),
      ]),
    ).rejects.toThrow("This skill folder is too large. Keep it under 8MB total.");
  });

  it("auto-renames duplicate skill names in the same batch", async () => {
    const result = await parseSkillFolderImport([
      folderFile("skills/alpha/SKILL.md", "---\nname: Duplicate\n---\n# A", "text/markdown"),
      folderFile("skills/beta/SKILL.md", "---\nname: Duplicate\n---\n# B", "text/markdown"),
    ]);

    expect(result.skills.map((skill) => skill.name)).toEqual([
      "Duplicate",
      "Duplicate (beta)",
    ]);
    expect(result.skills[1]).toMatchObject({
      originalName: "Duplicate",
      nameWasAdjusted: true,
    });
  });
});
