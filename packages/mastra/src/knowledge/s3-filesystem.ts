import { basename, extname, posix } from "node:path";
import {
  DirectoryNotEmptyError,
  DirectoryNotFoundError,
  FileExistsError,
  FileNotFoundError,
  IsDirectoryError,
  MastraFilesystem,
  NotDirectoryError,
  type CopyOptions,
  type FileContent,
  type FileEntry,
  type FileStat,
  type ListOptions,
  type ReadOptions,
  type RemoveOptions,
  type WriteOptions,
} from "@mastra/core/workspace";
import {
  buildKnowledgeSourceObjectPrefix,
  copyKnowledgeSourceObject,
  deleteKnowledgeCollectionObjects,
  deleteKnowledgeSourceObject,
  getKnowledgeSourceObject,
  headKnowledgeSourceObject,
  listKnowledgeSourceObjects,
  putKnowledgeSourceObject,
} from "./object-storage";

type ProviderStatus =
  | "pending"
  | "initializing"
  | "ready"
  | "destroying"
  | "destroyed"
  | "error";

function normalizeWorkspacePath(path: string): string {
  const normalized = posix.normalize(path.replaceAll("\\", "/").trim() || ".");

  if (normalized === "." || normalized === "/") {
    return "";
  }

  const withoutLeadingSlash = normalized.replace(/^\/+/, "");

  if (
    withoutLeadingSlash === ".." ||
    withoutLeadingSlash.startsWith("../") ||
    withoutLeadingSlash.includes("/../")
  ) {
    throw new Error(`Invalid workspace path: ${path}`);
  }

  return withoutLeadingSlash;
}

function encodeContent(content: FileContent): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }

  return new Uint8Array(content);
}

function toTextDecoderEncoding(
  encoding: BufferEncoding = "utf-8",
): string | undefined {
  switch (encoding) {
    case "utf8":
      return "utf-8";
    case "utf16le":
      return "utf-16le";
    case "latin1":
    case "binary":
      return "latin1";
    case "base64":
    case "base64url":
    case "hex":
      return undefined;
    default:
      return encoding;
  }
}

function decodeContent(bytes: Uint8Array, encoding: BufferEncoding = "utf-8") {
  const decoderEncoding = toTextDecoderEncoding(encoding);

  if (!decoderEncoding) {
    return Buffer.from(bytes).toString(encoding);
  }

  return new TextDecoder(decoderEncoding).decode(bytes);
}

function guessMimeType(path: string): string | undefined {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return undefined;
  }
}

export class S3Filesystem extends MastraFilesystem {
  readonly id: string;
  readonly name = "S3Filesystem";
  readonly provider = "s3";
  readonly readOnly = false;
  readonly description = "Knowledge files stored in object storage.";
  readonly displayName = "S3";
  readonly icon = "database" as const;
  readonly basePath: string;
  status: ProviderStatus = "pending";

  private readonly collectionId: string;
  private readonly userId: string;

  constructor(args: { collectionId: string; userId: string }) {
    super({ name: "S3Filesystem" });
    this.collectionId = args.collectionId;
    this.userId = args.userId;
    this.id = `s3:${args.userId}:${args.collectionId}`;
    this.basePath = buildKnowledgeSourceObjectPrefix(args);
  }

  override async init(): Promise<void> {
    return;
  }

  getInstructions() {
    return "All workspace paths are relative object paths inside the current collection root.";
  }

  private async getFileStat(path: string): Promise<FileStat | null> {
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      return {
        name: "/",
        path: "",
        type: "directory",
        size: 0,
        createdAt: new Date(0),
        modifiedAt: new Date(0),
      };
    }

    const object = await headKnowledgeSourceObject({
      userId: this.userId,
      collectionId: this.collectionId,
      relativePath: normalizedPath,
    });

    if (!object) {
      return null;
    }

    const timestamp = object.lastModified ?? new Date(0);

    return {
      name: basename(normalizedPath),
      path: normalizedPath,
      type: "file",
      size: object.size,
      createdAt: timestamp,
      modifiedAt: timestamp,
      mimeType: object.contentType,
    };
  }

  private async isDirectory(path: string): Promise<boolean> {
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      return true;
    }

    const prefix = `${normalizedPath}/`;
    const objects = await listKnowledgeSourceObjects({
      userId: this.userId,
      collectionId: this.collectionId,
    });

    return objects.some((object) => object.relativePath.startsWith(prefix));
  }

  override async readFile(
    path: string,
    options?: ReadOptions,
  ): Promise<string | Buffer> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);
    const fileStat = await this.getFileStat(normalizedPath);

    if (!fileStat) {
      throw new FileNotFoundError(normalizedPath);
    }

    if (fileStat.type === "directory") {
      throw new IsDirectoryError(normalizedPath);
    }

    const bytes = await getKnowledgeSourceObject({
      userId: this.userId,
      collectionId: this.collectionId,
      relativePath: normalizedPath,
    });

    if (options?.encoding) {
      return decodeContent(bytes, options.encoding);
    }

    return Buffer.from(bytes);
  }

  override async writeFile(
    path: string,
    content: FileContent,
    options?: WriteOptions,
  ): Promise<void> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      throw new IsDirectoryError(path);
    }

    const existing = await this.getFileStat(normalizedPath);

    if (existing && options?.overwrite === false) {
      throw new FileExistsError(normalizedPath);
    }

    await putKnowledgeSourceObject({
      userId: this.userId,
      collectionId: this.collectionId,
      relativePath: normalizedPath,
      body: encodeContent(content),
      contentType: options?.mimeType ?? guessMimeType(normalizedPath),
    });
  }

  override async appendFile(path: string, content: FileContent): Promise<void> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);
    const current = (await this.exists(normalizedPath))
      ? new Uint8Array(
          await this.readFile(normalizedPath).then((value) =>
            typeof value === "string"
              ? new TextEncoder().encode(value)
              : new Uint8Array(value),
          ),
        )
      : new Uint8Array();
    const appended = encodeContent(content);
    const next = new Uint8Array(current.length + appended.length);

    next.set(current);
    next.set(appended, current.length);

    await this.writeFile(normalizedPath, next);
  }

  override async deleteFile(
    path: string,
    options?: RemoveOptions,
  ): Promise<void> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);
    const fileStat = await this.getFileStat(normalizedPath);

    if (!fileStat) {
      if (options?.force) {
        return;
      }

      throw new FileNotFoundError(normalizedPath);
    }

    if (fileStat.type === "directory") {
      throw new IsDirectoryError(normalizedPath);
    }

    await deleteKnowledgeSourceObject({
      userId: this.userId,
      collectionId: this.collectionId,
      relativePath: normalizedPath,
    });
  }

  override async copyFile(
    src: string,
    dest: string,
    options?: CopyOptions,
  ): Promise<void> {
    await this.ensureReady();
    const sourcePath = normalizeWorkspacePath(src);
    const destinationPath = normalizeWorkspacePath(dest);
    const sourceStat = await this.getFileStat(sourcePath);

    if (!sourceStat) {
      throw new FileNotFoundError(sourcePath);
    }

    if (sourceStat.type === "directory") {
      throw new IsDirectoryError(sourcePath);
    }

    if ((await this.exists(destinationPath)) && options?.overwrite === false) {
      throw new FileExistsError(destinationPath);
    }

    await copyKnowledgeSourceObject({
      userId: this.userId,
      collectionId: this.collectionId,
      sourcePath,
      destinationPath,
    });
  }

  override async moveFile(
    src: string,
    dest: string,
    options?: CopyOptions,
  ): Promise<void> {
    await this.copyFile(src, dest, options);
    await this.deleteFile(src, { force: true });
  }

  override async mkdir(): Promise<void> {
    await this.ensureReady();
    return;
  }

  override async rmdir(path: string, options?: RemoveOptions): Promise<void> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      if (options?.recursive) {
        await deleteKnowledgeCollectionObjects({
          userId: this.userId,
          collectionId: this.collectionId,
        });
        return;
      }

      const entries = await this.readdir(".", { recursive: false });

      if (entries.length > 0) {
        throw new DirectoryNotEmptyError(path);
      }

      return;
    }

    if (!(await this.isDirectory(normalizedPath))) {
      if (options?.force) {
        return;
      }

      throw new DirectoryNotFoundError(normalizedPath);
    }

    const children = await this.readdir(normalizedPath, {
      recursive: true,
    });

    if (children.length > 0 && !options?.recursive) {
      throw new DirectoryNotEmptyError(normalizedPath);
    }

    await Promise.all(
      children
        .filter((entry) => entry.type === "file")
        .map((entry) =>
          this.deleteFile(posix.join(normalizedPath, entry.name), {
            force: true,
          }),
        ),
    );
  }

  override async readdir(
    path: string,
    options?: ListOptions,
  ): Promise<FileEntry[]> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);
    const prefix = normalizedPath ? `${normalizedPath}/` : "";
    const objects = await listKnowledgeSourceObjects({
      userId: this.userId,
      collectionId: this.collectionId,
    });
    const extensions = Array.isArray(options?.extension)
      ? options.extension
      : options?.extension
        ? [options.extension]
        : [];

    const entries = new Map<string, FileEntry>();

    for (const object of objects) {
      if (!object.relativePath.startsWith(prefix)) {
        continue;
      }

      const remainingPath = object.relativePath.slice(prefix.length);

      if (!remainingPath) {
        continue;
      }

      const segments = remainingPath.split("/").filter(Boolean);

      if (segments.length === 0) {
        continue;
      }

      if (!options?.recursive) {
        const [firstSegment] = segments;

        if (!firstSegment || entries.has(firstSegment)) {
          continue;
        }

        const isFile = segments.length === 1;

        if (
          isFile &&
          extensions.length > 0 &&
          !extensions.includes(extname(firstSegment))
        ) {
          continue;
        }

        entries.set(firstSegment, {
          name: firstSegment,
          type: isFile ? "file" : "directory",
          size: isFile ? object.size : 0,
        });
        continue;
      }

      let currentPath = "";

      segments.forEach((segment, index) => {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const depth = currentPath.split("/").length;

        if (options.maxDepth && depth > options.maxDepth) {
          return;
        }

        const isLast = index === segments.length - 1;

        if (
          isLast &&
          extensions.length > 0 &&
          !extensions.includes(extname(segment))
        ) {
          return;
        }

        if (!entries.has(currentPath)) {
          entries.set(currentPath, {
            name: currentPath,
            type: isLast ? "file" : "directory",
            size: isLast ? object.size : 0,
          });
        }
      });
    }

    if (!normalizedPath && !options?.recursive) {
      return [...entries.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    }

    if (!normalizedPath && entries.size === 0) {
      return [];
    }

    if (!normalizedPath || entries.size > 0) {
      return [...entries.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    }

    if (!(await this.isDirectory(normalizedPath))) {
      throw new NotDirectoryError(normalizedPath);
    }

    return [];
  }

  override async exists(path: string): Promise<boolean> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      return true;
    }

    return (
      Boolean(await this.getFileStat(normalizedPath)) ||
      (await this.isDirectory(normalizedPath))
    );
  }

  override async stat(path: string): Promise<FileStat> {
    await this.ensureReady();
    const normalizedPath = normalizeWorkspacePath(path);
    const fileStat = await this.getFileStat(normalizedPath);

    if (fileStat) {
      return fileStat;
    }

    if (await this.isDirectory(normalizedPath)) {
      return {
        name: basename(normalizedPath),
        path: normalizedPath,
        type: "directory",
        size: 0,
        createdAt: new Date(0),
        modifiedAt: new Date(0),
      };
    }

    throw new FileNotFoundError(normalizedPath);
  }
}
