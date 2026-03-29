import { ensureDefaultUser, runKnowledgeAgentQuestion } from "../knowledge";
import { DEPARTMENT_FIXTURE_SPACE } from "../knowledge/fixtures";
import { importDepartmentFixtures } from "../knowledge/fixtures/import";

const TEST_CASES = [
  {
    expectedKeywords: ["人力资源部", "人力资源"],
    question: "员工入职社保开户这件事应该交给哪个部门？",
  },
  {
    expectedKeywords: ["法务部", "法务"],
    question: "供应商合同条款审核这件事应该交给哪个部门？",
  },
  {
    expectedKeywords: ["信息安全部", "信息安全"],
    question: "办公电脑中毒事件处置应该交给哪个部门？",
  },
] as const;

if (!process.env.OPENAI_API_KEY?.trim()) {
  throw new Error(
    "OPENAI_API_KEY is required for the department agent smoke test",
  );
}

const importResult = await importDepartmentFixtures();
const user = await ensureDefaultUser();

console.log(
  `[atlas-kb/mastra] department fixtures ready in "${importResult.spaceId}" (imported=${importResult.imported.length}, skipped=${importResult.skipped.length})`,
);

for (const testCase of TEST_CASES) {
  const result = await runKnowledgeAgentQuestion({
    question: testCase.question,
    spaceId: DEPARTMENT_FIXTURE_SPACE.id,
    userId: user.id,
  });

  console.log(`\n[question] ${result.question}`);
  console.log(`[answer] ${result.answer}`);
  console.log(`[toolCalls] ${result.toolCalls}`);
  console.log(
    `[citations] ${result.citations.map((citation) => citation.title).join(", ")}`,
  );

  if (result.toolCalls <= 0) {
    throw new Error(
      `Agent did not call search_knowledge before answering: ${testCase.question}`,
    );
  }

  if (
    !testCase.expectedKeywords.some((keyword) =>
      result.answer.includes(keyword),
    )
  ) {
    throw new Error(
      `Agent answer did not mention an expected department for question: ${testCase.question}`,
    );
  }

  if (result.citations.length === 0) {
    throw new Error(
      `Agent answer did not return supporting citations for question: ${testCase.question}`,
    );
  }
}

console.log("\n[atlas-kb/mastra] department agent smoke test passed");
