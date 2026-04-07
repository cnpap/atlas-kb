import {
  createKnowledgeCollection,
  getKnowledgeCollection,
  getKnowledgeCollectionSourcesData,
} from "../repository";
import { importKnowledgeFile } from "../ingest";
import { ensureDefaultUser } from "../users";
import { DEPARTMENT_FIXTURE_SPACE, loadDepartmentFixtures } from ".";

export async function importDepartmentFixtures(): Promise<{
  collectionId: string;
  createdCollection: boolean;
  imported: string[];
  skipped: string[];
}> {
  const user = await ensureDefaultUser();
  const existingCollection = await getKnowledgeCollection(
    user.id,
    DEPARTMENT_FIXTURE_SPACE.id,
  );

  if (!existingCollection) {
    await createKnowledgeCollection({
      userId: user.id,
      input: {
        description: DEPARTMENT_FIXTURE_SPACE.description,
        id: DEPARTMENT_FIXTURE_SPACE.id,
        name: DEPARTMENT_FIXTURE_SPACE.name,
      },
    });
  }

  const existingDocuments = new Set(
    (
      await getKnowledgeCollectionSourcesData(
        user.id,
        DEPARTMENT_FIXTURE_SPACE.id,
      )
    ).sources
      .map((document) => document.sourceFilename)
      .filter((filename): filename is string => Boolean(filename)),
  );
  const fixtures = await loadDepartmentFixtures();
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const fixture of fixtures) {
    if (existingDocuments.has(fixture.filename)) {
      skipped.push(fixture.filename);
      continue;
    }

    await importKnowledgeFile({
      userId: user.id,
      collectionId: DEPARTMENT_FIXTURE_SPACE.id,
      file: new File([fixture.content], fixture.filename, {
        type: "text/markdown",
      }),
      input: {
        title: fixture.title,
      },
    });
    imported.push(fixture.filename);
  }

  return {
    collectionId: DEPARTMENT_FIXTURE_SPACE.id,
    createdCollection: !existingCollection,
    imported,
    skipped,
  };
}
