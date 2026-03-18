<script setup lang="ts">
  import { reactive, ref } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import { getErrorMessage, loginRequest } from "@/lib/api-client";
  import { setLoginSession } from "@/lib/auth";

  const router = useRouter();
  const route = useRoute();

  const state = reactive({
    email: "admin@atlas-kb.local",
    password: "atlas-kb-dev",
  });

  const loading = ref(false);
  const error = ref("");

  async function onSubmit() {
    loading.value = true;
    error.value = "";

    try {
      const session = await loginRequest({
        email: state.email,
        password: state.password,
      });
      const redirect = (route.query.redirect as string) || "/ask";
      setLoginSession(session);
      await router.replace(redirect);
    } catch (e: unknown) {
      error.value = getErrorMessage(e);
    } finally {
      loading.value = false;
    }
  }
</script>

<template>
  <div class="min-h-screen px-4 py-4 sm:px-6">
    <div
      class="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1280px] overflow-hidden rounded-[32px] border bg-white shadow-[var(--atlas-shadow-lg)] lg:grid-cols-[0.95fr_1.05fr]"
      style="border-color: var(--atlas-line);"
    >
      <section
        class="flex flex-col justify-between bg-[var(--atlas-bg)] p-8 sm:p-10"
      >
        <div class="space-y-6">
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
              <p class="text-xs text-[var(--atlas-text-muted)]">知识库工作台</p>
            </div>
          </div>

          <div class="space-y-4">
            <p class="atlas-label">登录</p>
            <h1
              class="text-4xl font-semibold tracking-tight text-[var(--atlas-text)]"
            >
              返回统一的知识库工作界面。
            </h1>
            <p
              class="max-w-xl text-base leading-7 text-[var(--atlas-text-muted)]"
            >
              当前版本已统一中文界面与浅色主题。登录后即可继续管理知识库空间、上传文档并发起带引用的问答。
            </p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="atlas-card p-4">
            <p class="atlas-label">默认账号</p>
            <p class="mt-3 font-mono text-sm text-[var(--atlas-text)]">
              admin@atlas-kb.local
            </p>
          </div>
          <div class="atlas-card p-4">
            <p class="atlas-label">默认密码</p>
            <p class="mt-3 font-mono text-sm text-[var(--atlas-text)]">
              atlas-kb-dev
            </p>
          </div>
        </div>
      </section>

      <section class="flex items-center justify-center p-6 sm:p-10">
        <div class="w-full max-w-md space-y-6">
          <div class="space-y-2">
            <h2
              class="text-2xl font-semibold tracking-tight text-[var(--atlas-text)]"
            >
              欢迎回来
            </h2>
            <p class="text-sm text-[var(--atlas-text-muted)]">
              使用开发环境账号登录，进入 Atlas 知识库工作台。
            </p>
          </div>

          <form
            class="atlas-panel space-y-5 p-6 sm:p-7"
            @submit.prevent="onSubmit"
          >
            <UFormField label="邮箱地址" name="email" required>
              <UInput
                v-model="state.email"
                type="email"
                placeholder="admin@atlas-kb.local"
                class="w-full"
                size="xl"
                :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
              />
            </UFormField>

            <UFormField label="密码" name="password" required>
              <UInput
                v-model="state.password"
                type="password"
                placeholder="••••••••"
                class="w-full"
                size="xl"
                :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
              />
            </UFormField>

            <UAlert
              v-if="error"
              color="error"
              variant="subtle"
              :title="error"
              icon="i-lucide-alert-circle"
            />

            <UButton
              type="submit"
              label="登录 Atlas"
              :loading="loading"
              block
              size="xl"
              class="rounded-2xl"
            />
          </form>
        </div>
      </section>
    </div>
  </div>
</template>
