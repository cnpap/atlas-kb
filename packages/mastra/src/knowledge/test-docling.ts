type MockDoclingFile = {
  fileName: string;
  mimeType: string;
  text: string;
};

async function readMockDoclingFile(body: unknown): Promise<MockDoclingFile> {
  const file = body instanceof FormData ? body.get("files") : undefined;

  if (!(file instanceof Blob)) {
    return {
      fileName: "document.txt",
      mimeType: "text/plain",
      text: "mock docling extracted content",
    };
  }

  const fileName =
    "name" in file && typeof file.name === "string" && file.name.trim()
      ? file.name.trim()
      : "document.txt";
  const mimeType = file.type?.trim() || "application/octet-stream";
  const text = (await file.text()).replaceAll("\0", "").trim();

  return {
    fileName,
    mimeType,
    text: text || `${fileName} extracted content`,
  };
}

export async function buildMockDoclingConvertPayload(
  body: unknown,
): Promise<Record<string, unknown>> {
  const file = await readMockDoclingFile(body);

  return {
    status: "success",
    document: {
      filename: file.fileName,
      json_content: {
        name: file.fileName,
        origin: {
          filename: file.fileName,
          mimetype: file.mimeType,
        },
        groups: [],
        pictures: [],
        tables: [],
        pages: [{ page_no: 1 }],
        texts: [
          {
            self_ref: "#/texts/0",
            text: file.text,
            orig: file.text,
            prov: [{ page_no: 1 }],
          },
        ],
      },
      chunks: [
        {
          id: "chunk-0",
          text: file.text,
          content: file.text,
          title: null,
          section_path: [],
        },
      ],
    },
  };
}
