import { importDepartmentFixtures } from "../knowledge/fixtures/import";

const result = await importDepartmentFixtures();

console.log(
  `[atlas-kb/mastra] department fixtures ready in "${result.spaceId}" (createdSpace=${String(result.createdSpace)}, imported=${result.imported.length}, skipped=${result.skipped.length})`,
);

if (result.imported.length > 0) {
  console.log(`[atlas-kb/mastra] imported: ${result.imported.join(", ")}`);
}

if (result.skipped.length > 0) {
  console.log(`[atlas-kb/mastra] skipped: ${result.skipped.join(", ")}`);
}
