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

test("资料编辑不会污染路由，也不会让聊天请求携带 sourceId", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const suffix = Date.now().toString(36);
  const collectionName = `E2E 编辑 ${suffix}`;
  const fileName = `editor-${suffix}.txt`;

  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("atlas-kb-dev");
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.getByTestId("create-collection-button").click();
  await page.getByTestId("create-collection-name").fill(collectionName);
  await page
    .getByTestId("create-collection-description")
    .fill("用于验证资料编辑与聊天请求解耦。");
  await page.getByTestId("create-collection-submit").click();

  const collectionItem = page
    .getByTestId("collection-item")
    .filter({ hasText: collectionName });
  await expect(collectionItem).toBeVisible();
  await collectionItem.click();

  await page.getByTestId("open-import-button").click();
  await page.getByTestId("import-file-input").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("这是一份用于验证编辑解耦的测试文件。"),
  });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/kb/collections/") &&
        response.url().includes("/uploads") &&
        response.request().method() === "POST",
    ),
    page.getByTestId("import-submit-button").click(),
  ]);
  await expect(
    page.getByRole("dialog", { name: "添加文件到当前分组" }),
  ).toBeHidden({
    timeout: 60_000,
  });

  const sourceCard = page.getByTestId("source-card").first();
  await expect(sourceCard).toBeVisible({ timeout: 60_000 });
  await sourceCard.getByTestId("source-edit-button").click();

  const editorDialog = page.getByRole("dialog", { name: "资料编辑器" });
  await expect(editorDialog).toBeVisible({ timeout: 60_000 });
  await expect(page).not.toHaveURL(/source=/);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/kb/sources/") &&
        response.request().method() === "PATCH",
    ),
    editorDialog.getByRole("button", { name: "保存修改" }).click(),
  ]);
  await expect(editorDialog).toBeHidden({ timeout: 60_000 });

  const replyRequestPromise = page.waitForRequest(
    (request) =>
      request.url().includes("/api/chat/sessions/") &&
      request.url().includes("/reply/stream") &&
      request.method() === "POST",
  );

  await page.getByTestId("chat-composer").fill("我们现在有哪些文件？");
  await page.getByTestId("chat-submit").click();

  const replyRequest = await replyRequestPromise;
  const requestBody = replyRequest.postDataJSON() as Record<string, unknown>;

  expect(requestBody.query).toBe("我们现在有哪些文件？");
  expect(requestBody).not.toHaveProperty("sourceId");
  await expect(page.getByText("当前优先文件：")).toHaveCount(0);
  await expect(page.getByText(fileName, { exact: false }).last()).toBeVisible({
    timeout: 60_000,
  });
});

test("导出任务支持选择模板、查看详情并保存修改", async ({ page }) => {
  test.setTimeout(120_000);

  const suffix = Date.now().toString(36);
  const collectionName = `E2E 导出 ${suffix}`;
  const fileName = `export-${suffix}.txt`;

  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("atlas-kb-dev");
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.getByTestId("create-collection-button").click();
  await page.getByTestId("create-collection-name").fill(collectionName);
  await page
    .getByTestId("create-collection-description")
    .fill("用于验证导出任务链路。");
  await page.getByTestId("create-collection-submit").click();

  const collectionItem = page
    .getByTestId("collection-item")
    .filter({ hasText: collectionName });
  await expect(collectionItem).toBeVisible();
  await collectionItem.click();

  await page.getByTestId("open-import-button").click();
  await page.getByTestId("import-file-input").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("这是一份用于导出任务验证的测试文件。"),
  });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/kb/collections/") &&
        response.url().includes("/uploads") &&
        response.request().method() === "POST",
    ),
    page.getByTestId("import-submit-button").click(),
  ]);
  await expect(
    page.getByRole("dialog", { name: "添加文件到当前分组" }),
  ).toBeHidden({
    timeout: 60_000,
  });

  const sourceCard = page.getByTestId("source-card").first();
  await expect(sourceCard).toBeVisible({ timeout: 60_000 });
  await sourceCard.getByTestId("source-export-button").click();

  const templateSubmitButton = page.getByTestId("export-template-submit");
  await expect(templateSubmitButton).toBeVisible({ timeout: 60_000 });
  const templateOption = page
    .locator('[data-testid^="export-template-option-"]')
    .first();
  await expect(templateOption).toBeVisible({ timeout: 60_000 });
  await templateOption.click();
  await templateSubmitButton.click();
  await expect(templateSubmitButton).toBeHidden({ timeout: 60_000 });

  await expect(page.getByTestId("context-panel-exports-tab")).toHaveClass(
    /primary/,
    {
      timeout: 60_000,
    },
  );
  const exportItem = page.getByText("拟办意见").first();
  await expect(exportItem).toBeVisible({ timeout: 60_000 });

  await page
    .getByTestId(/^export-task-detail-/)
    .first()
    .click();
  const detailSaveButton = page.getByTestId("export-task-save");
  await expect(detailSaveButton).toBeVisible({ timeout: 60_000 });

  const opinionField = page
    .getByTestId("export-task-field-拟办意见")
    .locator("textarea");
  await opinionField.fill("这是更新后的导出意见。");
  await detailSaveButton.click();

  await expect(opinionField).toHaveValue("这是更新后的导出意见。", {
    timeout: 60_000,
  });
  await expect(page.getByTestId("export-task-result")).toBeVisible({
    timeout: 60_000,
  });
});

test("刷新页面后会恢复当前资料与导出任务状态", async ({ page }) => {
  test.setTimeout(120_000);

  const suffix = Date.now().toString(36);
  const collectionName = `E2E 刷新 ${suffix}`;
  const fileName = `refresh-${suffix}.txt`;

  await page.goto("/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("atlas-kb-dev");
  await page.getByRole("button", { name: "登 录" }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.getByTestId("create-collection-button").click();
  await page.getByTestId("create-collection-name").fill(collectionName);
  await page
    .getByTestId("create-collection-description")
    .fill("用于验证刷新恢复链路。");
  await page.getByTestId("create-collection-submit").click();

  const collectionItem = page
    .getByTestId("collection-item")
    .filter({ hasText: collectionName });
  await expect(collectionItem).toBeVisible();
  await collectionItem.click();

  await page.getByTestId("open-import-button").click();
  await page.getByTestId("import-file-input").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("这是一份用于刷新恢复验证的测试文件。"),
  });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/kb/collections/") &&
        response.url().includes("/uploads") &&
        response.request().method() === "POST",
    ),
    page.getByTestId("import-submit-button").click(),
  ]);
  await expect(
    page.getByRole("dialog", { name: "添加文件到当前分组" }),
  ).toBeHidden({
    timeout: 60_000,
  });

  const sourceCard = page.getByTestId("source-card").first();
  await expect(sourceCard).toBeVisible({ timeout: 60_000 });
  await sourceCard.getByTestId("source-export-button").click();

  const templateSubmitButton = page.getByTestId("export-template-submit");
  await expect(templateSubmitButton).toBeVisible({ timeout: 60_000 });
  const templateOption = page
    .locator('[data-testid^="export-template-option-"]')
    .first();
  await expect(templateOption).toBeVisible({ timeout: 60_000 });
  await templateOption.click();
  await templateSubmitButton.click();
  await expect(templateSubmitButton).toBeHidden({ timeout: 60_000 });

  await expect(page.getByTestId("context-panel-exports-tab")).toHaveClass(
    /primary/,
    {
      timeout: 60_000,
    },
  );

  await page.reload();
  await expect(page).toHaveURL(/\/app/);
  await expect(collectionItem).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("context-panel-exports-tab")).toHaveClass(
    /primary/,
    {
      timeout: 60_000,
    },
  );
  await expect(
    page.getByText("拟办意见", { exact: false }).first(),
  ).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId("context-panel-library-tab").click();
  await expect(page.getByTestId("context-panel-library-tab")).toHaveClass(
    /primary/,
    {
      timeout: 60_000,
    },
  );
  await expect(page.getByTestId("source-card").first()).toBeVisible({
    timeout: 60_000,
  });
});
