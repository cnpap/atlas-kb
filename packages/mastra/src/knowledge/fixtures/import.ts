import {
  createKnowledgeSpace,
  getKnowledgeSpaceDocuments,
  getKnowledgeSpace,
} from "../repository";
import { uploadKnowledgeDocument } from "../ingest";
import { DEPARTMENT_FIXTURE_SPACE, loadDepartmentFixtures } from ".";

export async function importDepartmentFixtures(): Promise<{
  createdSpace: boolean;
  imported: string[];
  skipped: string[];
  spaceId: string;
}> {
  const existingSpace = await getKnowledgeSpace(DEPARTMENT_FIXTURE_SPACE.id);

  if (!existingSpace) {
    await createKnowledgeSpace({
      description: DEPARTMENT_FIXTURE_SPACE.description,
      id: DEPARTMENT_FIXTURE_SPACE.id,
      name: DEPARTMENT_FIXTURE_SPACE.name,
    });
  }

  const existingDocuments = new Set(
    (await getKnowledgeSpaceDocuments(DEPARTMENT_FIXTURE_SPACE.id)).documents
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

    await uploadKnowledgeDocument({
      file: new File([fixture.content], fixture.filename, {
        type: "text/markdown",
      }),
      metadata: {
        title: fixture.title,
      },
      spaceId: DEPARTMENT_FIXTURE_SPACE.id,
    });
    imported.push(fixture.filename);
  }

  return {
    createdSpace: !existingSpace,
    imported,
    skipped,
    spaceId: DEPARTMENT_FIXTURE_SPACE.id,
  };
}
