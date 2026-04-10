import type {
  KnowledgeSource,
  KnowledgeSourceIndexProgress,
} from "@atlas-kb/schema";

type SourceStatus = "ready" | "processing" | "failed" | "archived";
type ExportTaskStatus = "completed" | "failed" | "pending" | "processing";

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

export function getSourceIndexProgressStatusLabel(
  progress?: KnowledgeSourceIndexProgress,
): string {
  if (!progress) {
    return "未开始";
  }

  switch (progress.status) {
    case "canonicalizing":
      return "解析中";
    case "indexing":
      return "索引中";
    case "paused":
      return "等待续跑";
    case "failed":
      return "索引失败";
    case "completed":
      return "索引完成";
    default:
      return "处理中";
  }
}

export function getSourceIndexProgressSummaryLines(
  progress?: KnowledgeSourceIndexProgress,
): string[] {
  if (!progress) {
    return [];
  }

  const lines: string[] = [];

  if (progress.totalChunks > 0) {
    lines.push(
      `已索引 ${progress.completedChunks} / ${progress.totalChunks} 块`,
    );
  } else if (progress.status === "canonicalizing") {
    lines.push("正在解析文档结构");
  }

  if (progress.failedChunks > 0) {
    lines.push(`失败 ${progress.failedChunks} 块`);
  }

  if (progress.lastProcessedPage !== null) {
    lines.push(`最近处理到第 ${progress.lastProcessedPage} 页`);
  }

  return lines;
}

export function shouldShowSourceIndexProgress(source: {
  failureMessage?: KnowledgeSource["failureMessage"];
  indexProgress?: KnowledgeSourceIndexProgress;
  status: KnowledgeSource["status"];
}): boolean {
  if (source.failureMessage) {
    return true;
  }

  if (!source.indexProgress) {
    return false;
  }

  if (
    source.status === "ready" &&
    source.indexProgress.status === "completed"
  ) {
    return false;
  }

  return (
    source.indexProgress.status !== "completed" || source.status !== "ready"
  );
}

export function formatPageNumberList(pageNumbers: number[]): string {
  const normalized = [
    ...new Set(pageNumbers.filter((value) => value > 0)),
  ].sort((left, right) => left - right);

  if (normalized.length === 0) {
    return "未记录页码";
  }

  return normalized.length === 1
    ? `第 ${normalized[0]} 页`
    : `第 ${normalized.join("、")} 页`;
}

export function getExportTaskStatusLabel(status: ExportTaskStatus): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "processing":
      return "导出中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return "未知";
  }
}

export function getExportTaskStatusTone(
  status: ExportTaskStatus,
): "ready" | "processing" | "failed" {
  switch (status) {
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    default:
      return "processing";
  }
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
