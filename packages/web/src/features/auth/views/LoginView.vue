<script setup lang="ts">
  import { computed, ref } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import {
    ArrowRight,
    CircleAlert,
    LoaderCircle,
    LockKeyhole,
    ShieldCheck,
    UserRound,
  } from "lucide-vue-next";
  import { loginWithPassword, useAuthSession } from "@/lib/auth-session";
  import { getErrorMessage } from "@/lib/api-client";

  const route = useRoute();
  const router = useRouter();
  const { pending } = useAuthSession();

  const username = ref("");
  const password = ref("");
  const error = ref("");

  const nextPath = computed(() => {
    const next = route.query.next;
    return typeof next === "string" && next.trim() ? next : "/app";
  });

  async function submitLogin() {
    if (!username.value.trim() || !password.value.trim()) {
      error.value = "请输入用户名和密码";
      return;
    }

    error.value = "";

    try {
      await loginWithPassword({
        username: username.value.trim(),
        password: password.value,
      });
      await router.replace(nextPath.value);
    } catch (cause) {
      error.value = getErrorMessage(cause);
    }
  }
</script>

<template>
  <section
    class="min-h-screen bg-[linear-gradient(180deg,#f5efe4_0%,#f1eadf_100%)]"
  >
    <div
      class="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[minmax(0,1fr)_440px]"
    >
      <div
        class="hidden min-h-screen flex-col justify-between border-r border-[rgba(93,72,34,0.08)] px-8 py-10 lg:flex"
      >
        <div>
          <div class="flex items-center gap-2 text-[var(--accent-strong)]">
            <ShieldCheck class="size-4" />
            <span class="section-label">ATLAS KB</span>
          </div>

          <h1
            class="mt-8 max-w-[560px] text-[52px] leading-[0.98] font-semibold tracking-[-0.06em] text-[var(--text-strong)]"
          >
            知识工作区入口
          </h1>
          <p class="mt-5 max-w-md text-base leading-7 text-[var(--text-muted)]">
            统一进入资料、检索与会话工作台。
          </p>
        </div>

        <div class="grid grid-cols-3 gap-6">
          <div class="space-y-2">
            <p class="section-label text-[10px]">资料</p>
            <p class="text-sm font-semibold text-[var(--text-strong)]">
              整理当前资料库
            </p>
            <p class="text-sm leading-6 text-[var(--text-muted)]">
              文件、正文、摘要与标签统一维护。
            </p>
          </div>
          <div class="space-y-2">
            <p class="section-label text-[10px]">检索</p>
            <p class="text-sm font-semibold text-[var(--text-strong)]">
              查看引用命中
            </p>
            <p class="text-sm leading-6 text-[var(--text-muted)]">
              搜索结果与问答引用在同一工作区内处理。
            </p>
          </div>
          <div class="space-y-2">
            <p class="section-label text-[10px]">会话</p>
            <p class="text-sm font-semibold text-[var(--text-strong)]">
              管理历史上下文
            </p>
            <p class="text-sm leading-6 text-[var(--text-muted)]">
              按文件夹维度保留问答记录与追踪路径。
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center px-4 py-6 sm:px-8">
        <div
          class="w-full rounded-[16px] border border-[rgba(93,72,34,0.12)] bg-[rgba(255,253,248,0.92)] p-6 shadow-[0_18px_42px_rgba(55,34,10,0.12)] sm:p-8"
        >
          <div
            class="flex items-start justify-between gap-4 border-b border-[rgba(93,72,34,0.08)] pb-5"
          >
            <div>
              <p class="section-label">ATLAS KB</p>
              <h2
                class="mt-3 text-[30px] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--text-strong)]"
              >
                工作区登录
              </h2>
              <p class="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                使用用户名和密码进入当前环境。
              </p>
            </div>
            <ShieldCheck
              class="mt-1 size-5 shrink-0 text-[var(--accent-strong)]"
            />
          </div>

          <div
            v-if="error"
            class="mt-6 flex items-start gap-3 rounded-[10px] border-l-2 border-[var(--rose)] bg-[rgba(255,247,240,0.72)] px-4 py-3 text-sm text-[var(--rose)]"
          >
            <CircleAlert class="mt-0.5 size-4 shrink-0" />
            <span class="leading-6">{{ error }}</span>
          </div>

          <form class="mt-7 space-y-4" @submit.prevent="submitLogin">
            <label class="block space-y-2">
              <span class="section-label">用户名</span>
              <div
                class="group field-shell flex items-center gap-3.5 !rounded-[14px] !border-[rgba(93,72,34,0.12)] !bg-[rgba(255,255,255,0.74)] !px-3.5 !py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
              >
                <div
                  class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(93,72,34,0.06)] text-[var(--text-muted)] transition group-focus-within:bg-[rgba(15,118,110,0.1)] group-focus-within:text-[var(--accent-strong)]"
                >
                  <UserRound class="size-4" />
                </div>
                <input
                  v-model="username"
                  class="input-reset text-[15px] leading-6"
                  autocomplete="username"
                  autocapitalize="none"
                  placeholder="输入用户名"
                  :disabled="pending"
                  spellcheck="false"
                >
              </div>
            </label>

            <label class="block space-y-2">
              <span class="section-label">密码</span>
              <div
                class="group field-shell flex items-center gap-3.5 !rounded-[14px] !border-[rgba(93,72,34,0.12)] !bg-[rgba(255,255,255,0.74)] !px-3.5 !py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
              >
                <div
                  class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(93,72,34,0.06)] text-[var(--text-muted)] transition group-focus-within:bg-[rgba(15,118,110,0.1)] group-focus-within:text-[var(--accent-strong)]"
                >
                  <LockKeyhole class="size-4" />
                </div>
                <input
                  v-model="password"
                  class="input-reset text-[15px] leading-6"
                  type="password"
                  autocomplete="current-password"
                  placeholder="输入密码"
                  :disabled="pending"
                >
              </div>
            </label>

            <button
              class="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-strong)_100%)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(15,118,110,0.22)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              :disabled="pending"
            >
              <LoaderCircle v-if="pending" class="size-4 animate-spin" />
              <span>{{ pending ? "登录中..." : "进入工作区" }}</span>
              <ArrowRight v-if="!pending" class="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>
