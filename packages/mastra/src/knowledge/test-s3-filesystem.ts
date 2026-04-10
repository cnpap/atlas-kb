import { LocalFilesystem } from "@mastra/core/workspace";

export class TestS3LocalFilesystem extends LocalFilesystem {
  override readonly provider = "s3" as "local";

  constructor(
    private readonly config: {
      basePath: string;
      bucket?: string;
      displayName?: string;
      id?: string;
      prefix?: string;
      readOnly?: boolean;
    },
  ) {
    super({
      basePath: config.basePath,
      id: config.id,
      readOnly: config.readOnly,
    });
  }

  override getInfo() {
    const info = super.getInfo();

    return {
      ...info,
      provider: "s3",
      metadata: {
        ...(info.metadata &&
        typeof info.metadata === "object" &&
        !Array.isArray(info.metadata)
          ? info.metadata
          : {}),
        bucket: this.config.bucket ?? "atlas-kb-test",
        prefix: this.config.prefix ?? "",
      },
    } as typeof info;
  }
}
