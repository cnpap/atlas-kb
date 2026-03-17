import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEPARTMENT_FIXTURE_SPACE = {
  description: "用于判断事项应归属哪个职能部门的样本资料库。",
  id: "department-routing",
  name: "部门职责库",
} as const;

export interface KnowledgeFixtureFile {
  content: string;
  filename: string;
  path: string;
  title: string;
}

const FIXTURES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "departments",
);

function resolveFixtureTitle(content: string, filename: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();

  if (heading) {
    return heading;
  }

  return filename.replace(extname(filename), "").replace(/[-_]+/g, " ").trim();
}

export async function loadDepartmentFixtures(): Promise<
  KnowledgeFixtureFile[]
> {
  const entries = await readdir(FIXTURES_DIR, {
    withFileTypes: true,
  });
  const filenames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    filenames.map(async (filename) => {
      const path = resolve(FIXTURES_DIR, filename);
      const content = await readFile(path, "utf8");

      return {
        content,
        filename,
        path,
        title: resolveFixtureTitle(content, filename),
      };
    }),
  );
}
