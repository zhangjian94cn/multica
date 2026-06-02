"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileText, FolderOpen, Upload } from "lucide-react";
import type { CreateSkillRequest, Skill } from "@multica/core/types";
import { Badge } from "@multica/ui/components/ui/badge";
import { Button } from "@multica/ui/components/ui/button";
import { Checkbox } from "@multica/ui/components/ui/checkbox";

import { useAppLocale } from "../../i18n";
import {
  parseSkillFolderImport,
  toCreateSkillRequest,
  type ParsedLocalSkillImport,
  type ParsedLocalSkillFolder,
} from "../utils/local-folder-import";

type CountLabel = string | ((count: number) => string);

export interface FolderSkillImportSelection {
  parsed: ParsedLocalSkillFolder;
  request: CreateSkillRequest;
  existingSkill: Skill | null;
  nameWasAdjusted: boolean;
}

export function FolderSkillImportPanel({
  onImport,
  existingSkills = [],
  submitLabel,
  submittingLabel,
}: {
  onImport: (
    selections: FolderSkillImportSelection[],
  ) => Promise<void>;
  existingSkills?: Skill[];
  submitLabel?: CountLabel;
  submittingLabel?: string;
}) {
  const { text, translate } = useAppLocale();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedLocalSkillImport | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [folderSelectionSupported, setFolderSelectionSupported] = useState(true);

  const existingByName = useMemo(
    () => new Map(existingSkills.map((skill) => [skill.name, skill])),
    [existingSkills],
  );

  const importSelections = useMemo<FolderSkillImportSelection[]>(() => {
    if (!parsed) return [];

    const usedNames = new Set(existingSkills.map((skill) => skill.name));
    return parsed.skills.map((skill) => {
      const reusableSkill = skill.nameWasAdjusted ? null : existingByName.get(skill.name) ?? null;
      let requestName = skill.name;
      let workspaceAdjusted = false;

      if (!reusableSkill) {
        const originalRequestName = requestName;
        requestName = uniqueWorkspaceName(requestName, skill.rootName, usedNames);
        workspaceAdjusted = requestName !== originalRequestName;
        usedNames.add(requestName);
      }

      return {
        parsed: skill,
        request: toCreateSkillRequest({ ...skill, name: requestName }),
        existingSkill: reusableSkill,
        nameWasAdjusted: skill.nameWasAdjusted || workspaceAdjusted,
      };
    });
  }, [existingByName, existingSkills, parsed]);

  const selectedSelections = useMemo(
    () => importSelections.filter((item) => selectedKeys.has(item.parsed.key)),
    [importSelections, selectedKeys],
  );

  const allSelected =
    importSelections.length > 0 &&
    selectedSelections.length === importSelections.length;

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    }

    if (typeof document === "undefined" || typeof navigator === "undefined") {
      return;
    }
    const probe = document.createElement("input");
    const userAgent = navigator.userAgent;
    setFolderSelectionSupported(
      "webkitdirectory" in probe ||
        "showDirectoryPicker" in window ||
        /Chrome|Chromium|Edg|Electron/i.test(userAgent),
    );
  }, []);

  const handleChooseFolder = () => {
    setError("");
    inputRef.current?.click();
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    setError("");
    try {
      const result = await parseSkillFolderImport(files);
      setParsed(result);
      setSelectedKeys(new Set(result.skills.map((skill) => skill.key)));
    } catch (err) {
      setParsed(null);
      setSelectedKeys(new Set());
      setError(
        err instanceof Error
          ? translate(err.message)
          : text("Failed to read skill folder", "读取技能文件夹失败"),
      );
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (selectedSelections.length === 0) return;
    setImporting(true);
    setError("");
    try {
      await onImport(selectedSelections);
      setParsed(null);
      setSelectedKeys(new Set());
    } catch (err) {
      setError(
        err instanceof Error
          ? translate(err.message)
          : text("Failed to import skill", "导入技能失败"),
      );
    } finally {
      setImporting(false);
    }
  };

  const toggleSkill = (key: string, selected: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedKeys(
      allSelected
        ? new Set()
        : new Set(importSelections.map((item) => item.parsed.key)),
    );
  };

  const resolvedSubmitLabel =
    typeof submitLabel === "function"
      ? submitLabel(selectedSelections.length)
      : submitLabel ?? text("Import selected {count}", "导入选中的 {count} 个").replace(
          "{count}",
          String(selectedSelections.length),
        );

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        data-testid="folder-skill-input"
        onChange={(event) => handleFilesSelected(event.currentTarget.files)}
      />

      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-center">
        <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">
          {text("Choose a local skill folder", "选择本地 skill 文件夹")}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {text(
            "Select a skill folder or a parent folder containing multiple SKILL.md files. Multica reads skill content and supporting text files without uploading local absolute paths.",
            "请选择一个 skill 文件夹，或包含多个 SKILL.md 的父文件夹。Multica 只读取技能内容和辅助文本文件，不上传本地绝对路径。",
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={handleChooseFolder}
          disabled={parsing || importing}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {parsing
            ? text("Reading folder...", "正在读取文件夹...")
            : text("Choose Skill Folder", "选择技能文件夹")}
        </Button>
      </div>

      {!folderSelectionSupported && (
        <div className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          {text(
            "This browser may not support folder selection. Use Chromium or the desktop app.",
            "当前浏览器可能不支持文件夹选择。请使用 Chromium 或桌面应用。",
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {parsed && (
        <div className="rounded-lg border bg-background">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {text(
                  `Found ${importSelections.length} skills`,
                  `发现 ${importSelections.length} 个技能`,
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {text(
                  `Selected ${selectedSelections.length}`,
                  `已选择 ${selectedSelections.length} 个`,
                )}
              </p>
            </div>
            <Button type="button" variant="ghost" size="xs" onClick={toggleAll}>
              {allSelected
                ? text("Clear selection", "清空选择")
                : text("Select all", "全选")}
            </Button>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y">
            {importSelections.map((item) => {
              const checked = selectedKeys.has(item.parsed.key);
              return (
                <label
                  key={item.parsed.key}
                  className="flex min-w-0 cursor-pointer items-start gap-3 px-3 py-3 hover:bg-accent/40"
                >
                  <Checkbox
                    checked={checked}
                    aria-label={`Select ${item.request.name}`}
                    className="mt-0.5"
                    onCheckedChange={(next) => toggleSkill(item.parsed.key, next === true)}
                  />
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-semibold">{item.request.name}</h4>
                      <Badge variant="secondary">
                        {translate(`${item.parsed.fileCount} files`)}
                      </Badge>
                      {item.existingSkill && (
                        <Badge variant="outline">
                          {text("Already exists, will reuse", "已存在，将复用")}
                        </Badge>
                      )}
                      {item.nameWasAdjusted && (
                        <Badge variant="outline">
                          {text("Renamed automatically", "已自动重命名")}
                        </Badge>
                      )}
                    </div>
                    {item.request.name !== item.parsed.originalName && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {text("Original name", "原名称")}：
                        <span className="font-mono">{item.parsed.originalName}</span>
                      </p>
                    )}
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.parsed.description || text("No description", "无描述")}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <div className="truncate">
                        {text("Root folder", "根文件夹")}：
                        <span className="font-mono text-foreground">
                          {item.parsed.rootPath === "."
                            ? item.parsed.rootName
                            : item.parsed.rootPath}
                        </span>
                      </div>
                      <div>
                        {text("Supporting files", "辅助文件")}：
                        <span className="font-mono text-foreground">
                          {item.parsed.files.length}
                        </span>
                      </div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {text(
          "Hidden files, node_modules, LICENSE files, binary files, and oversized bundles are ignored or rejected.",
          "隐藏文件、node_modules、LICENSE 文件、二进制文件和超限文件包会被忽略或拒绝。",
        )}
      </p>

      <div className="flex justify-end">
        <Button
          onClick={handleImport}
          disabled={selectedSelections.length === 0 || parsing || importing}
        >
          {importing ? (
            submittingLabel ?? text("Importing...", "正在导入...")
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              {resolvedSubmitLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function uniqueWorkspaceName(
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
