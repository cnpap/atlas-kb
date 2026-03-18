<script setup lang="ts">
  import { computed, ref } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import { clearAuthSession, useAuthState } from "@/lib/auth";

  const route = useRoute();
  const router = useRouter();
  const { authSession } = useAuthState();
  const sidebarOpen = ref(false);

  const navigation = computed(() => [
    {
      label: "智能问答",
      description: "基于已索引文档发起问答，并查看引用来源。",
      icon: "i-lucide-message-circle",
      to: "/ask",
      active: route.path.startsWith("/ask"),
    },
    {
      label: "知识库空间",
      description: "浏览知识库、管理文档内容，并创建新的空间。",
      icon: "i-lucide-library",
      to: "/kb",
      active: route.path.startsWith("/kb"),
    },
  ]);

  const pageMeta = computed(() => ({
    title: String(route.meta.title || "Atlas 工作台"),
    caption: route.path.startsWith("/ask")
      ? "围绕知识库检索、引用与回答组织的问答工作台"
      : route.path.startsWith("/kb/")
        ? "在同一界面中完成文档上传、下载、浏览与问答"
        : "集中管理知识库空间、文档与问答入口",
  }));

  async function logout() {
    clearAuthSession();
    sidebarOpen.value = false;
    await router.replace("/login");
  }

  function closeSidebar() {
    sidebarOpen.value = false;
  }
</script>

<template>
  <div class="atlas-app-shell">
    <div class="atlas-shell-grid">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <button
          v-if="sidebarOpen"
          type="button"
          class="fixed inset-0 z-30 bg-slate-950/20 lg:hidden"
          @click="closeSidebar"
        />
      </Transition>

      <aside
        class="atlas-sidebar fixed inset-y-3 left-3 z-40 h-auto max-h-[calc(100vh-1.5rem)] -translate-x-[calc(100%+1rem)] transition-transform duration-200 lg:static lg:inset-auto lg:h-[calc(100vh-2rem)] lg:max-h-none lg:translate-x-0"
        :class="sidebarOpen ? 'translate-x-0' : ''"
      >
        <div
          class="flex items-center gap-3 border-b px-5 py-5"
          style="border-color: var(--atlas-line);"
        >
          <div
            class="flex size-11 items-center justify-center rounded-2xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
          >
            <UIcon name="i-lucide-layers" class="size-5" />
          </div>
          <div>
            <p class="text-sm font-semibold text-[var(--atlas-text)]">
              Atlas KB
            </p>
            <p class="text-xs text-[var(--atlas-text-muted)]">知识库工作台</p>
          </div>
        </div>

        <div class="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
          <UButton
            to="/ask"
            icon="i-lucide-plus"
            label="发起新对话"
            block
            class="justify-start rounded-2xl"
            @click="closeSidebar"
          />

          <div class="space-y-2">
            <p class="atlas-label px-2">工作区</p>

            <RouterLink
              v-for="item in navigation"
              :key="item.to"
              :to="item.to"
              class="block rounded-2xl border px-4 py-3 transition-colors"
              :class="
                item.active
                  ? 'border-[var(--ui-primary)] bg-[var(--atlas-primary-soft)]'
                  : 'border-[var(--atlas-line)] bg-transparent hover:bg-[var(--atlas-bg-soft)]'
              "
              @click="closeSidebar"
            >
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 items-center justify-center rounded-xl"
                  :class="item.active ? 'bg-white text-[var(--ui-primary)]' : 'bg-[var(--atlas-bg-soft)] text-[var(--atlas-text-muted)]'"
                >
                  <UIcon :name="item.icon" class="size-4" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-[var(--atlas-text)]">
                    {{ item.label }}
                  </p>
                  <p
                    class="mt-1 text-xs leading-5 text-[var(--atlas-text-muted)]"
                  >
                    {{ item.description }}
                  </p>
                </div>
              </div>
            </RouterLink>
          </div>

          <div class="atlas-panel-muted p-4">
            <p class="atlas-label">当前界面</p>
            <p class="mt-2 text-sm font-medium text-[var(--atlas-text)]">
              统一浅色主题、中文界面、围绕知识库操作重新组织。
            </p>
            <p class="mt-2 text-sm leading-6 text-[var(--atlas-text-muted)]">
              当前工作台以知识检索流转为中心，而不是通用后台卡片拼接。
            </p>
          </div>
        </div>

        <div
          class="border-t px-4 py-4"
          style="border-color: var(--atlas-line);"
        >
          <div class="atlas-panel-muted flex items-center gap-3 p-3">
            <UAvatar
              :alt="authSession?.user.email"
              size="sm"
              class="shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p
                class="truncate text-sm font-semibold text-[var(--atlas-text)]"
              >
                {{ authSession?.user.email }}
              </p>
              <p class="truncate text-xs text-[var(--atlas-text-muted)]">
                已登录
              </p>
            </div>
          </div>

          <UButton
            icon="i-lucide-log-out"
            label="退出登录"
            variant="outline"
            color="error"
            block
            class="atlas-action-danger mt-3 justify-start rounded-2xl"
            @click="logout"
          />
        </div>
      </aside>

      <section class="atlas-workspace">
        <header
          class="border-b px-4 py-4 sm:px-6"
          style="border-color: var(--atlas-line);"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <UButton
                icon="i-lucide-menu"
                color="neutral"
                variant="ghost"
                class="mt-0.5 rounded-xl lg:hidden"
                @click="sidebarOpen = true"
              />
              <div>
                <div class="atlas-chip mb-2">
                  <UIcon
                    name="i-lucide-sparkles"
                    class="size-3.5 text-[var(--ui-primary)]"
                  />
                  Atlas 工作台
                </div>
                <h1
                  class="text-xl font-semibold tracking-tight text-[var(--atlas-text)] sm:text-2xl"
                >
                  {{ pageMeta.title }}
                </h1>
                <p class="mt-1 text-sm text-[var(--atlas-text-muted)]">
                  {{ pageMeta.caption }}
                </p>
              </div>
            </div>

            <a
              href="https://github.com/mastra-ai/mastra"
              target="_blank"
              rel="noopener noreferrer"
              class="atlas-chip shrink-0 hover:border-[var(--atlas-line-strong)] hover:text-[var(--atlas-text)]"
            >
              <UIcon name="i-simple-icons-github" class="size-3.5" />
              源码
            </a>
          </div>
        </header>

        <main class="min-h-0 flex-1 overflow-hidden bg-[var(--atlas-bg)]">
          <slot />
        </main>
      </section>
    </div>
  </div>
</template>
