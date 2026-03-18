<script setup lang="ts">
  import { useAuthState } from "@/lib/auth";

  const { isAuthenticated } = useAuthState();

  const features = [
    {
      title: "可追溯问答",
      description: "面向已索引知识库提问，并结合引用来源生成可核验的回答。",
      icon: "i-lucide-message-circle",
    },
    {
      title: "知识库空间",
      description: "按团队、项目或主题拆分空间，避免检索上下文混杂。",
      icon: "i-lucide-library",
    },
    {
      title: "统一上传流程",
      description: "以一致的流程接入 PDF、Markdown 与纯文本文档。",
      icon: "i-lucide-file-up",
    },
    {
      title: "集中化管理",
      description: "把零散文档、问答入口和空间浏览统一到一个清晰界面。",
      icon: "i-lucide-layout-panel-top",
    },
  ];

  const stats = [
    { label: "检索方式", value: "向量 + 词法" },
    { label: "支持格式", value: "PDF、TXT、MD" },
    { label: "回答形式", value: "带引用的可溯源回答" },
  ];
</script>

<template>
  <div class="min-h-screen px-4 py-4 sm:px-6">
    <div
      class="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1440px] flex-col rounded-[32px] border bg-white shadow-[var(--atlas-shadow-lg)]"
      style="border-color: var(--atlas-line);"
    >
      <header
        class="flex items-center justify-between border-b px-6 py-5 sm:px-8"
        style="border-color: var(--atlas-line);"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex size-11 items-center justify-center rounded-2xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
          >
            <UIcon name="i-lucide-layers" class="size-5" />
          </div>
          <div>
            <p class="text-sm font-semibold text-[var(--atlas-text)]">
              Atlas KB
            </p>
            <p class="text-xs text-[var(--atlas-text-muted)]">
              企业知识库工作台
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <UButton
            v-if="isAuthenticated"
            to="/ask"
            label="进入工作台"
            trailing-icon="i-lucide-arrow-right"
            class="rounded-full"
          />
          <UButton
            v-else
            to="/login"
            label="立即登录"
            color="neutral"
            variant="outline"
            class="atlas-action-secondary rounded-full"
          />
        </div>
      </header>

      <main
        class="grid flex-1 gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch"
      >
        <section
          class="flex flex-col justify-between gap-8 rounded-[28px] bg-[var(--atlas-bg)] p-6 sm:p-8"
        >
          <div class="space-y-6">
            <div class="atlas-chip">
              <UIcon
                name="i-lucide-sparkles"
                class="size-3.5 text-[var(--ui-primary)]"
              />
              面向知识检索与文档管理重新设计
            </div>

            <div class="space-y-4">
              <p class="atlas-label">Atlas 知识库</p>
              <h1
                class="max-w-4xl text-4xl font-semibold tracking-tight text-[var(--atlas-text)] sm:text-5xl lg:text-6xl"
              >
                为检索、引用与文档操作而设计的统一工作界面。
              </h1>
              <p
                class="max-w-2xl text-base leading-7 text-[var(--atlas-text-muted)] sm:text-lg"
              >
                Atlas KB
                将知识库空间、文档上传下载与带引用的问答能力集中到同一套清晰界面中，减少后台拼凑感与信息割裂。
              </p>
            </div>

            <div class="flex flex-wrap gap-3">
              <UButton
                v-if="isAuthenticated"
                to="/ask"
                label="进入问答"
                size="xl"
                trailing-icon="i-lucide-arrow-right"
                class="rounded-full"
              />
              <UButton
                v-else
                to="/login"
                label="登录 Atlas"
                size="xl"
                trailing-icon="i-lucide-arrow-right"
                class="rounded-full"
              />
              <UButton
                to="/kb"
                label="浏览知识库"
                size="xl"
                color="neutral"
                variant="outline"
                class="atlas-action-secondary rounded-full"
              />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div v-for="stat in stats" :key="stat.label" class="atlas-card p-4">
              <p class="atlas-label">{{ stat.label }}</p>
              <p class="mt-3 text-sm font-semibold text-[var(--atlas-text)]">
                {{ stat.value }}
              </p>
            </div>
          </div>
        </section>

        <section class="grid gap-4 sm:grid-cols-2">
          <article
            v-for="feature in features"
            :key="feature.title"
            class="atlas-card atlas-card-hover flex min-h-[220px] flex-col justify-between p-6"
          >
            <div
              class="flex size-12 items-center justify-center rounded-2xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
            >
              <UIcon :name="feature.icon" class="size-5" />
            </div>

            <div class="space-y-3">
              <h2 class="text-lg font-semibold text-[var(--atlas-text)]">
                {{ feature.title }}
              </h2>
              <p class="text-sm leading-6 text-[var(--atlas-text-muted)]">
                {{ feature.description }}
              </p>
            </div>
          </article>
        </section>
      </main>
    </div>
  </div>
</template>
