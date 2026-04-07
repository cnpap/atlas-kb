type SourceType = "file" | "text" | "seed";
type SourceStatus = "ready" | "processing" | "failed" | "archived";
export type KnowledgeFileKind =
  | "generic"
  | "pdf"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "code"
  | "text";

const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  ".cjs",
  ".csv",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".markdown",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

const MIME_EXTENSION_FALLBACKS = new Map<string, string>([
  ["text/html", ".html"],
  ["text/markdown", ".md"],
  ["text/plain", ".txt"],
  ["text/csv", ".csv"],
  ["application/json", ".json"],
  ["application/xml", ".xml"],
  ["text/xml", ".xml"],
  ["application/yaml", ".yaml"],
  ["text/yaml", ".yaml"],
]);

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  day: "numeric",
});

export function formatDateTime(value?: string): string {
  if (!value) {
    return "未记录";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
}

export function formatRelativeTime(value?: string): string {
  if (!value) {
    return "刚刚";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diffMs = timestamp - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", {
    numeric: "auto",
  });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (Math.abs(diffHours) < 48) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

export function getSourceTypeLabel(type: SourceType): string {
  switch (type) {
    case "file":
      return "文件";
    case "text":
      return "笔记";
    case "seed":
      return "示例";
    default:
      return "其他";
  }
}

export function getSourceStatusLabel(status: SourceStatus): string {
  switch (status) {
    case "ready":
      return "可用";
    case "processing":
      return "处理中";
    case "failed":
      return "失败";
    case "archived":
      return "已归档";
    default:
      return "未知";
  }
}

export function getSourceStatusTone(
  status: SourceStatus,
): "ready" | "processing" | "failed" | "archived" {
  return status;
}

function getFileExtension(filename?: string, mimeType?: string): string {
  const dotIndex = filename?.lastIndexOf(".") ?? -1;

  if (dotIndex >= 0) {
    return filename?.slice(dotIndex).toLowerCase() || "";
  }

  return MIME_EXTENSION_FALLBACKS.get(mimeType || "") || "";
}

function getFileKind(extension: string): KnowledgeFileKind {
  switch (extension) {
    case ".pdf":
      return "pdf";
    case ".doc":
    case ".docx":
      return "word";
    case ".csv":
    case ".xls":
    case ".xlsx":
      return "spreadsheet";
    case ".ppt":
    case ".pptx":
      return "presentation";
    case ".htm":
    case ".html":
    case ".json":
    case ".xml":
    case ".yaml":
    case ".yml":
      return "code";
    case ".markdown":
    case ".md":
    case ".txt":
      return "text";
    default:
      return "generic";
  }
}

function getFormatLabel(extension: string, mimeType?: string): string {
  if (extension) {
    return extension.slice(1).toUpperCase();
  }

  if (mimeType) {
    return mimeType.split("/").pop()?.toUpperCase() || "FILE";
  }

  return "FILE";
}

export function formatFileSize(value?: number): string {
  if (!value || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : size >= 100 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function getKnowledgeFileDisplay(params: {
  filename?: string;
  mimeType?: string;
}): {
  extension: string;
  formatLabel: string;
  kind: KnowledgeFileKind;
  supported: boolean;
} {
  const extension = getFileExtension(params.filename, params.mimeType);

  return {
    extension,
    formatLabel: getFormatLabel(extension, params.mimeType),
    kind: getFileKind(extension),
    supported:
      SUPPORTED_UPLOAD_EXTENSIONS.has(extension) ||
      Boolean(params.mimeType?.startsWith("text/")),
  };
}
