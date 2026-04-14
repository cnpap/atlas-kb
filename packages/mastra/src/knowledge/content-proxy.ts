import { Buffer } from "node:buffer";
import type {
  CopyOptions,
  FileContent,
  FileEntry,
  FileStat,
  FilesystemInfo,
  ListOptions,
  ReadOptions,
  RemoveOptions,
  WorkspaceFilesystem,
  WriteOptions,
} from "@mastra/core/workspace";
import { extractContentFromBytes, isEmptyExtractedContentError } from "./tika";

const EXTRACTABLE_EXTENSIONS = new Set(["pdf", "docx", "xlsx"]);
const EXTRACTABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const RAW_WORKSPACE_FILESYSTEM = Symbol("atlas-kb.raw-workspace-filesystem");

export type EmptyExtractedContentMode = "throw" | "empty";

type KnowledgeFilesystemReadOptions = {
  emptyExtractedContent?: EmptyExtractedContentMode;
};

function getPathExtension(path: string): string | null {
  const sanitized = path.split("?")[0]?.split("#")[0] ?? path;
  const filename = sanitized.split("/").at(-1) ?? sanitized;
  const extension = filename.toLowerCase().split(".").pop();

  if (!extension || extension === filename.toLowerCase()) {
    return null;
  }

  return extension;
}

function deriveMimeType(path: string): string | undefined {
  const extension = getPathExtension(path);

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (extension === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  return undefined;
}

function deriveFileName(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").at(-1)?.trim() || "document";
}

function isExtractableDocument(args: {
  path: string;
  mimeType?: string;
}): boolean {
  const extension = getPathExtension(args.path);

  if (extension && EXTRACTABLE_EXTENSIONS.has(extension)) {
    return true;
  }

  if (!args.mimeType) {
    return false;
  }

  return EXTRACTABLE_MIME_TYPES.has(args.mimeType.toLowerCase());
}

function toReadFileResult(text: string, encoding: BufferEncoding | undefined) {
  const buffer = Buffer.from(text, "utf8");

  if (!encoding) {
    return buffer;
  }

  return buffer.toString(encoding);
}

function toUint8Array(content: string | Uint8Array): Uint8Array {
  if (typeof content === "string") {
    return Buffer.from(content);
  }

  return new Uint8Array(content);
}

export function unwrapContentProxyFilesystem(
  filesystem: WorkspaceFilesystem,
): WorkspaceFilesystem {
  return (
    (
      filesystem as WorkspaceFilesystem & {
        [RAW_WORKSPACE_FILESYSTEM]?: WorkspaceFilesystem;
      }
    )[RAW_WORKSPACE_FILESYSTEM] ?? filesystem
  );
}

class TikaContentProxyFilesystem implements WorkspaceFilesystem {
  public readonly id: string;
  public readonly name = "TikaContentProxyFilesystem";
  public readonly provider: string;
  public readonly readOnly: boolean | undefined;
  public readonly icon: string | undefined;
  public readonly displayName: string | undefined;
  public readonly description: string | undefined;
  public readonly [RAW_WORKSPACE_FILESYSTEM]: WorkspaceFilesystem;
  private readonly emptyExtractedContent: EmptyExtractedContentMode;

  public constructor(
    private readonly filesystem: WorkspaceFilesystem,
    options: KnowledgeFilesystemReadOptions = {},
  ) {
    this.id = `${filesystem.id}-content-proxy`;
    this.provider = filesystem.provider;
    this.readOnly = filesystem.readOnly;
    this.icon = filesystem.icon;
    this.displayName = filesystem.displayName;
    this.description = filesystem.description;
    this[RAW_WORKSPACE_FILESYSTEM] = filesystem;
    this.emptyExtractedContent = options.emptyExtractedContent ?? "throw";
  }

  public get status() {
    return this.filesystem.status;
  }

  private async getFilesystemInfo(): Promise<
    FilesystemInfo<Record<string, unknown>>
  > {
    const upstreamInfo = await this.filesystem.getInfo?.();

    return {
      id: this.filesystem.id,
      name: this.filesystem.name,
      provider: this.filesystem.provider,
      status: this.filesystem.status,
      readOnly: this.filesystem.readOnly,
      icon: this.filesystem.icon,
      ...(upstreamInfo ?? {}),
    };
  }

  public async getInfo(): Promise<FilesystemInfo<Record<string, unknown>>> {
    const info = await this.getFilesystemInfo();

    return {
      ...info,
      id: this.id,
      name: this.name,
      provider: this.provider,
      readOnly: this.readOnly ?? info.readOnly,
      icon: this.icon ?? info.icon,
    };
  }

  public getInstructions(
    options?: Parameters<
      NonNullable<WorkspaceFilesystem["getInstructions"]>
    >[0],
  ) {
    void options;

    const upstream = this.filesystem.getInstructions?.() ?? "";
    const proxyInstructions = [
      "读取 pdf、docx、xlsx 时会直接返回 Tika 提取后的文本结果，而不是原始二进制。",
      this.emptyExtractedContent === "empty"
        ? "如果文档无法提取出文本，会返回空内容。"
        : "",
    ]
      .filter(Boolean)
      .join("");

    return upstream ? `${upstream}\n\n${proxyInstructions}` : proxyInstructions;
  }

  public getMountConfig() {
    return this.filesystem.getMountConfig?.() ?? { type: this.provider };
  }

  public resolveAbsolutePath(path: string) {
    return this.filesystem.resolveAbsolutePath?.(path);
  }

  public async readFile(path: string, options?: ReadOptions) {
    const stat = await this.filesystem.stat(path);

    if (!isExtractableDocument({ path, mimeType: stat.mimeType })) {
      return this.filesystem.readFile(path, options);
    }

    const fileContent = await this.filesystem.readFile(path);
    let extracted: Awaited<ReturnType<typeof extractContentFromBytes>>;

    try {
      extracted = await extractContentFromBytes({
        bytes: toUint8Array(fileContent),
        fileName: deriveFileName(path),
        mimeType: stat.mimeType ?? deriveMimeType(path),
      });
    } catch (error) {
      if (
        this.emptyExtractedContent === "empty" &&
        isEmptyExtractedContentError(error)
      ) {
        return toReadFileResult("", options?.encoding);
      }

      throw error;
    }

    return toReadFileResult(extracted.text, options?.encoding);
  }

  public async writeFile(
    path: string,
    content: FileContent,
    options?: WriteOptions,
  ): Promise<void> {
    return this.filesystem.writeFile(path, content, options);
  }

  public async appendFile(path: string, content: FileContent): Promise<void> {
    return this.filesystem.appendFile(path, content);
  }

  public async deleteFile(
    path: string,
    options?: RemoveOptions,
  ): Promise<void> {
    return this.filesystem.deleteFile(path, options);
  }

  public async copyFile(
    src: string,
    dest: string,
    options?: CopyOptions,
  ): Promise<void> {
    return this.filesystem.copyFile(src, dest, options);
  }

  public async moveFile(
    src: string,
    dest: string,
    options?: CopyOptions,
  ): Promise<void> {
    return this.filesystem.moveFile(src, dest, options);
  }

  public async mkdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    return this.filesystem.mkdir(path, options);
  }

  public async rmdir(path: string, options?: RemoveOptions): Promise<void> {
    return this.filesystem.rmdir(path, options);
  }

  public async readdir(
    path: string,
    options?: ListOptions,
  ): Promise<FileEntry[]> {
    return this.filesystem.readdir(path, options);
  }

  public async exists(path: string): Promise<boolean> {
    return this.filesystem.exists(path);
  }

  public async stat(path: string): Promise<FileStat> {
    return this.filesystem.stat(path);
  }
}

export function wrapKnowledgeFilesystemForReading(
  filesystem: WorkspaceFilesystem,
  options?: KnowledgeFilesystemReadOptions,
): WorkspaceFilesystem {
  if (
    (
      filesystem as WorkspaceFilesystem & {
        [RAW_WORKSPACE_FILESYSTEM]?: WorkspaceFilesystem;
      }
    )[RAW_WORKSPACE_FILESYSTEM]
  ) {
    return filesystem;
  }

  return new TikaContentProxyFilesystem(filesystem, options);
}
