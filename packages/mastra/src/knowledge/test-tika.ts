import { basename, extname } from "node:path";

type TestHeadersInit =
  | Headers
  | Array<[string, string]>
  | Record<string, string>;

function readHeaderValue(
  headers: TestHeadersInit | undefined,
  key: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }

  if (Array.isArray(headers)) {
    const match = headers.find(
      ([headerKey]) => headerKey.toLowerCase() === key.toLowerCase(),
    );
    return match?.[1];
  }

  const value = headers[key as keyof typeof headers];
  return typeof value === "string" ? value : undefined;
}

function getMimeTypeForFileName(fileName: string): string {
  const extension = extname(fileName).toLowerCase();

  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".md":
      return "text/markdown";
    default:
      return "text/plain";
  }
}

function deriveFileName(init?: RequestInit): string {
  const encodedFileName = readHeaderValue(
    init?.headers as TestHeadersInit | undefined,
    "X-File-Name",
  );

  if (encodedFileName) {
    try {
      const decoded = decodeURIComponent(encodedFileName);
      return basename(decoded) || "document.txt";
    } catch {
      return basename(encodedFileName) || "document.txt";
    }
  }

  const contentDisposition = readHeaderValue(
    init?.headers as TestHeadersInit | undefined,
    "Content-Disposition",
  );

  if (contentDisposition) {
    const filenameMatch =
      /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition) ??
      /filename="?([^";]+)"?/i.exec(contentDisposition);

    if (filenameMatch?.[1]) {
      try {
        const decoded = decodeURIComponent(filenameMatch[1]);
        return basename(decoded) || "document.txt";
      } catch {
        return basename(filenameMatch[1]) || "document.txt";
      }
    }
  }

  return "document.txt";
}

export function buildMockTikaExtractPayload(
  init?: RequestInit,
): Array<Record<string, string>> {
  const fileName = deriveFileName(init);
  const title = basename(fileName, extname(fileName)) || "document";

  return [
    {
      "Content-Type": getMimeTypeForFileName(fileName),
      "X-TIKA:content": `${title} extracted content`,
    },
  ];
}
