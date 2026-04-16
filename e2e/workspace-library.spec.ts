import { expect, type Locator, type Page, test } from "@playwright/test";

async function openSourceMenu(sourceCard: Locator) {
  const menuButton = sourceCard.getByTestId("source-menu-button");
  await menuButton.click();
  await expect(sourceCard.getByTestId("source-menu")).toBeVisible();
}

async function expectActiveCollection(page: Page, name: string) {
  await expect(page.getByTestId("collection-switcher-trigger")).toContainText(
    name,
    {
      timeout: 60_000,
    },
  );
}

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
  await expectActiveCollection(page, collectionName);

  const contextPane = page.getByTestId("workspace-context-pane");
  const sourceFilterInput = page.getByTestId("source-filter-input");
  await expect(contextPane).toBeVisible();
  await expect(sourceFilterInput).toBeVisible();
  await expect(sourceFilterInput).toHaveAttribute(
    "placeholder",
    "搜索文件标题",
  );

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

  const sourceIcon = sourceCard.getByTestId("source-file-icon");
  const sourceTitle = sourceCard.getByTestId("source-card-title");
  const sourceActions = sourceCard.getByTestId("source-card-actions");
  await expect(sourceIcon).toBeVisible();
  await expect(sourceTitle).toContainText(fileName);
  const titleBox = await sourceTitle.boundingBox();
  const iconBox = await sourceIcon.boundingBox();
  const actionsBox = await sourceActions.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(iconBox!.x).toBeLessThan(titleBox!.x);
  expect(actionsBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width - 20);
  await expect(sourceCard.locator(".status-pill")).toHaveCount(0);
  await expect(sourceCard.getByTestId("source-card-meta")).toHaveCount(0);
  await expect(sourceCard.getByTestId("source-card-task-message")).toHaveCount(
    0,
  );
  await expect(sourceCard).not.toContainText("后台处理中");
  await expect(sourceCard).not.toContainText(/(刚刚|分钟前|小时前|天前)/);
  await expect(sourceCard.getByText("未填写摘要")).toHaveCount(0);

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
  await expectActiveCollection(page, collectionName);

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
  await openSourceMenu(sourceCard);
  await sourceCard.getByTestId("source-menu-edit").click();

  const editorDialog = page.getByRole("dialog", { name: "资料编辑器" });
  await expect(editorDialog).toBeVisible({ timeout: 60_000 });
  await expect(page).not.toHaveURL(/source=/);
  await editorDialog
    .getByPlaceholder("编辑当前资料正文")
    .fill("这是一份用于验证编辑解耦的测试文件。\n已更新正文内容。");

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
  const sourceTitle = fileName.replace(/\.txt$/, "");

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
  await expectActiveCollection(page, collectionName);

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
  await openSourceMenu(sourceCard);
  await sourceCard.getByTestId("source-menu-export").click();

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
  const exportTaskCard = page.locator("article").filter({
    has: page.getByText(sourceTitle, { exact: false }),
  });
  await expect(exportTaskCard).toBeVisible({ timeout: 60_000 });
  await exportTaskCard
    .locator('[data-testid^="export-task-menu-button-"]')
    .click();
  await exportTaskCard.locator('[data-testid^="export-task-detail-"]').click();
  const detailSaveButton = page.getByTestId("export-task-save");
  await expect(detailSaveButton).toBeVisible({ timeout: 60_000 });

  const opinionField = page
    .getByTestId("export-task-field-opinion")
    .locator("textarea");
  const saveRequest = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kb/export-tasks/") &&
      response.request().method() === "PATCH",
  );
  await opinionField.fill("这是更新后的导出意见。");
  await Promise.all([saveRequest, detailSaveButton.click()]);

  await expect(opinionField).toHaveValue("这是更新后的导出意见。", {
    timeout: 60_000,
  });
});

test("刷新页面后会恢复当前资料与导出任务状态", async ({ page }) => {
  test.setTimeout(120_000);

  const suffix = Date.now().toString(36);
  const collectionName = `E2E 刷新 ${suffix}`;
  const fileName = `refresh-${suffix}.txt`;
  const sourceTitle = fileName.replace(/\.txt$/, "");

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
  await expectActiveCollection(page, collectionName);

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
  await openSourceMenu(sourceCard);
  await sourceCard.getByTestId("source-menu-export").click();

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
  await expect(
    page.locator("article").filter({
      has: page.getByText(sourceTitle, { exact: false }),
    }),
  ).toBeVisible({
    timeout: 60_000,
  });

  await page.reload();
  await expect(page).toHaveURL(/\/app/);
  await expectActiveCollection(page, collectionName);
  await expect(page.getByTestId("context-panel-exports-tab")).toHaveClass(
    /primary/,
    {
      timeout: 60_000,
    },
  );
  await expect(
    page.locator("article").filter({
      has: page.getByText(sourceTitle, { exact: false }),
    }),
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
