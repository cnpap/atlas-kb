import { expect, test } from "@playwright/test";

test("上传文件后右栏布局正常，并且对话能列出当前文件", async ({ page }) => {
  test.setTimeout(120_000);

  const suffix = Date.now().toString(36);
  const collectionName = `E2E 文件夹 ${suffix}`;
  const fileName = `e2e-${suffix}.txt`;

  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("atlas-kb-dev");
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.getByTestId("create-collection-button").click();
  await page.getByTestId("create-collection-name").fill(collectionName);
  await page
    .getByTestId("create-collection-description")
    .fill("用于验证上传后列文件问答链路。");
  await page.getByTestId("create-collection-submit").click();

  const collectionItem = page
    .getByTestId("collection-item")
    .filter({ hasText: collectionName });
  await expect(collectionItem).toBeVisible();
  await collectionItem.click();

  const contextPane = page.getByTestId("workspace-context-pane");
  const sourceFilterInput = page.getByTestId("source-filter-input");
  await expect(contextPane).toBeVisible();
  await expect(sourceFilterInput).toBeVisible();

  const paneBox = await contextPane.boundingBox();
  const filterBox = await sourceFilterInput.boundingBox();
  expect(paneBox).not.toBeNull();
  expect(filterBox).not.toBeNull();
  expect(filterBox!.width).toBeGreaterThan(paneBox!.width - 80);

  await page.getByTestId("open-import-button").click();
  await page.getByTestId("import-file-input").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("这是一份用于端到端验证的测试文件。"),
  });
  const uploadRequest = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kb/collections/") &&
      response.url().includes("/uploads") &&
      response.request().method() === "POST",
    {
      timeout: 30_000,
    },
  );
  await Promise.all([
    uploadRequest,
    page.getByTestId("import-submit-button").click(),
  ]);
  await expect(
    page.getByRole("dialog", { name: "添加文件到当前分组" }),
  ).toBeHidden({
    timeout: 60_000,
  });

  const sourceCard = page.getByTestId("source-card").first();
  await expect(sourceCard).toBeVisible({ timeout: 60_000 });

  const sourceTitle = sourceCard.getByTestId("source-card-title");
  const sourceActions = sourceCard.getByTestId("source-card-actions");
  const titleBox = await sourceTitle.boundingBox();
  const actionsBox = await sourceActions.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height);

  await page.getByTestId("chat-composer").fill("我们现在有哪些文件？");
  await page.getByTestId("chat-submit").click();
  await expect(page.getByText(fileName, { exact: false }).last()).toBeVisible({
    timeout: 60_000,
  });
});
