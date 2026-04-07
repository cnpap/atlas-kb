import { importDepartmentFixtures } from "../knowledge/fixtures/import";

const result = await importDepartmentFixtures();

console.log(
  `[mastra] department fixtures ready in "${result.collectionId}" (createdCollection=${String(result.createdCollection)}, imported=${result.imported.length}, skipped=${result.skipped.length})`,
);

if (result.imported.length > 0) {
  console.log(`[mastra] imported: ${result.imported.join(", ")}`);
}

if (result.skipped.length > 0) {
  console.log(`[mastra] skipped: ${result.skipped.join(", ")}`);
}
