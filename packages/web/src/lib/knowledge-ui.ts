type SourceType = "file" | "text" | "url" | "seed";
type SourceStatus = "ready" | "processing" | "failed" | "archived";

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
    case "url":
      return "网页";
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
