import { getTikaBaseUrl } from "./config";

type TikaDocument = {
  "Content-Type"?: string;
  "X-TIKA:content"?: string;
};

type ExtractedTikaContent = {
  contentType?: string;
  text: string;
  textLength: number;
};

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

function buildTikaHeaders(args: {
  fileName?: string;
  mimeType?: string;
}): Headers {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (args.mimeType?.trim()) {
    headers.set("Content-Type", args.mimeType.trim());
  }

  if (args.fileName?.trim()) {
    const normalizedFileName = args.fileName.trim();
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(normalizedFileName)}`,
    );
    headers.set("X-File-Name", encodeURIComponent(normalizedFileName));
  }

  return headers;
}

export async function extractContentFromBytes(args: {
  bytes: Uint8Array;
  fileName?: string;
  mimeType?: string;
}): Promise<ExtractedTikaContent> {
  let response: Response;

  try {
    response = await fetch(`${getTikaBaseUrl()}/rmeta/text`, {
      method: "PUT",
      headers: buildTikaHeaders(args),
      body: args.bytes,
    });
  } catch (error) {
    console.error("[knowledge:tika] request error", {
      error: error instanceof Error ? error.message : String(error),
      fileName: args.fileName,
      mimeType: args.mimeType,
      tikaBaseUrl: getTikaBaseUrl(),
    });
    throw error;
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");

    console.error("[knowledge:tika] extract failed", {
      fileName: args.fileName,
      mimeType: args.mimeType,
      responseBody: responseBody.trim().slice(0, 1000),
      status: response.status,
      tikaBaseUrl: getTikaBaseUrl(),
    });

    throw new Error(`tika extract failed: ${response.status}`);
  }

  const [document] = (await response.json()) as [TikaDocument];
  const text = normalizeText(document?.["X-TIKA:content"] ?? "");

  if (!text) {
    throw new Error("当前文件没有可索引的文本内容");
  }

  return {
    contentType:
      document?.["Content-Type"] ?? args.mimeType?.trim() ?? undefined,
    text,
    textLength: text.length,
  };
}
