<script setup lang="ts">
  import { computed, ref } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import {
    ArrowRight,
    CircleAlert,
    LoaderCircle,
    ShieldCheck,
    UserRound,
    LockKeyhole,
  } from "lucide-vue-next";
  import { loginWithPassword, useAuthSession } from "@/lib/auth-session";
  import { getErrorMessage } from "@/lib/api-client";

  const route = useRoute();
  const router = useRouter();
  const { pending } = useAuthSession();

  const username = ref("");
  const password = ref("");
  const error = ref("");

  const systemName = import.meta.env.VITE_APP_TITLE || "数据局政务智能体";

  const nextPath = computed(() => {
    const next = route.query.next;
    return typeof next === "string" && next.trim() ? next : "/app";
  });

  async function submitLogin() {
    if (!username.value.trim() || !password.value.trim()) {
      error.value = "请输入账号和密码";
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
  <div class="app-shell flex selection:bg-[var(--accent)] selection:text-white">
    <!-- 左侧：品牌与愿景区 -->
    <div
      class="hidden lg:flex lg:w-[55%] flex-col justify-between bg-[linear-gradient(135deg,#f6f1e9_0%,#efe8dc_100%)] p-10 lg:p-14 xl:p-16 relative overflow-hidden"
    >
      <!-- 极简背景纹理 -->
      <div
        class="absolute inset-0 opacity-[0.03]"
        style="background-image: linear-gradient(rgba(93, 72, 34, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(93, 72, 34, 1) 1px, transparent 1px); background-size: 64px 64px;"
      ></div>

      <!-- Header -->
      <div class="relative z-10">
        <div class="flex items-center gap-3 text-[var(--text-strong)]">
          <ShieldCheck class="size-6" stroke-width="1.5" />
          <span class="text-[15px] font-semibold tracking-widest"
            >{{ systemName }}</span
          >
        </div>
      </div>

      <!-- Main Typography -->
      <div class="relative z-10 max-w-2xl my-auto">
        <h1
          class="text-[2.5rem] xl:text-[3rem] font-medium leading-[1.2] tracking-tight text-[var(--text-strong)] mb-8"
        >
          {{ systemName }}
        </h1>
        <p
          class="text-lg xl:text-xl text-[var(--text-muted)] leading-relaxed max-w-lg"
        >
          围绕单位内部资料、业务规则与办理流程，提供公文写作、智能分办和资料问答支持。
        </p>
      </div>

      <!-- Features List -->
      <div
        class="relative z-10 grid grid-cols-3 gap-8 border-t border-[rgba(93,72,34,0.12)] pt-12"
      >
        <div class="group">
          <div
            class="text-[13px] font-medium tracking-wider text-[var(--accent-strong)] mb-4 opacity-70"
          >
            01
          </div>
          <h3 class="text-[16px] font-medium text-[var(--text-strong)] mb-2">
            统一资料库
          </h3>
          <p class="text-[14px] text-[var(--text-muted)] leading-relaxed">
            内部资料、制度文件和业务材料统一管理，便于查找和引用。
          </p>
        </div>
        <div class="group">
          <div
            class="text-[13px] font-medium tracking-wider text-[var(--accent-strong)] mb-4 opacity-70"
          >
            02
          </div>
          <h3 class="text-[16px] font-medium text-[var(--text-strong)] mb-2">
            公文写作
          </h3>
          <p class="text-[14px] text-[var(--text-muted)] leading-relaxed">
            根据资料和业务要求，辅助起草、梳理和完善公文内容。
          </p>
        </div>
        <div class="group">
          <div
            class="text-[13px] font-medium tracking-wider text-[var(--accent-strong)] mb-4 opacity-70"
          >
            03
          </div>
          <h3 class="text-[16px] font-medium text-[var(--text-strong)] mb-2">
            智能分办
          </h3>
          <p class="text-[14px] text-[var(--text-muted)] leading-relaxed">
            结合事项内容和资料依据，辅助判断受理方向和协同部门。
          </p>
        </div>
      </div>
    </div>

    <!-- 右侧：系统登录区 -->
    <div
      class="flex-1 flex flex-col justify-center bg-[var(--ui-bg)] px-6 sm:px-16 lg:px-24 xl:px-32 relative"
    >
      <div class="w-full max-w-[380px] mx-auto">
        <!-- 移动端 Logo -->
        <div class="lg:hidden flex items-center gap-2 mb-12">
          <ShieldCheck
            class="size-7 text-[var(--accent-strong)]"
            stroke-width="1.5"
          />
          <span
            class="text-[18px] font-semibold tracking-widest text-[var(--text-strong)]"
            >{{ systemName }}</span
          >
        </div>

        <div class="mb-10">
          <h2
            class="text-[26px] font-medium text-[var(--text-strong)] tracking-tight"
          >
            系统登录
          </h2>
          <p class="mt-2 text-[15px] text-[var(--text-muted)]">
            请输入您的工作账号进入系统
          </p>
        </div>

        <!-- 统一组件: notice-strip -->
        <div v-if="error" class="notice-strip warn !mx-0 !mt-0 mb-6">
          <CircleAlert class="size-4 shrink-0" />
          <span>{{ error }}</span>
        </div>

        <form class="space-y-5" @submit.prevent="submitLogin">
          <label class="block space-y-2">
            <!-- 统一组件: section-label -->
            <span class="section-label block">账号</span>
            <!-- 统一组件: field-shell -->
            <div class="field-shell flex items-center gap-3">
              <UserRound
                class="size-[18px] text-[var(--text-muted)] shrink-0"
              />
              <!-- 统一组件: input-reset -->
              <input
                id="username"
                v-model="username"
                type="text"
                autocomplete="username"
                class="input-reset"
                placeholder="请输入账号"
                :disabled="pending"
                spellcheck="false"
              >
            </div>
          </label>

          <label class="block space-y-2">
            <!-- 统一组件: section-label -->
            <span class="section-label block">密码</span>
            <!-- 统一组件: field-shell -->
            <div class="field-shell flex items-center gap-3">
              <LockKeyhole
                class="size-[18px] text-[var(--text-muted)] shrink-0"
              />
              <!-- 统一组件: input-reset -->
              <input
                id="password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                class="input-reset"
                placeholder="请输入密码"
                :disabled="pending"
              >
            </div>
          </label>

          <div class="pt-2">
            <!-- 统一组件: soft-button primary -->
            <button
              type="submit"
              :disabled="pending"
              class="soft-button primary w-full !py-3"
            >
              <LoaderCircle v-if="pending" class="size-4 animate-spin" />
              <span>{{ pending ? "正在登录..." : "登 录" }}</span>
              <ArrowRight v-if="!pending" class="size-4" />
            </button>
          </div>
        </form>

        <div class="mt-16 text-left">
          <p
            class="text-[12px] text-[var(--text-muted)] tracking-wide opacity-80"
          >
            内部系统 · 请注意保密<br>
            <span class="inline-block mt-1"
              >&copy; {{ systemName }} 保留所有权利</span
            >
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
