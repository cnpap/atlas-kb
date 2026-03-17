<script setup lang="ts">
  import { onMounted, ref } from "vue";
  import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
  import { fetchCurrentSession, getErrorMessage } from "@/lib/api-client";
  import {
    clearAuthSession,
    hasAuthToken,
    replaceSession,
    useAuthState,
  } from "@/lib/auth";

  const route = useRoute();
  const router = useRouter();
  const { authSession, isAuthenticated } = useAuthState();
  const sessionError = ref("");

  async function syncSession() {
    if (!hasAuthToken()) {
      return;
    }

    try {
      const session = await fetchCurrentSession();
      replaceSession(session);
      sessionError.value = "";
    } catch (error) {
      clearAuthSession();
      sessionError.value = getErrorMessage(error);

      if (route.meta.requiresAuth) {
        await router.replace({
          name: "login",
          query: {
            redirect: route.fullPath,
          },
        });
      }
    }
  }

  function logout() {
    clearAuthSession();
    void router.replace("/");
  }

  onMounted(() => {
    void syncSession();
  });
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/">ATLAS KB</RouterLink>
      <nav class="nav-links">
        <RouterLink to="/">Overview</RouterLink>
        <RouterLink v-if="isAuthenticated" to="/kb">Spaces</RouterLink>
        <RouterLink v-if="isAuthenticated" to="/ask">Ask</RouterLink>
        <RouterLink v-if="!isAuthenticated" to="/login">Login</RouterLink>
      </nav>
      <div v-if="isAuthenticated" class="session-strip">
        <span class="tag">{{ authSession?.user.email }}</span>
        <button
          class="button button-secondary session-button"
          type="button"
          @click="logout"
        >
          Sign out
        </button>
      </div>
    </header>

    <main class="app-main">
      <div v-if="sessionError" class="status status-error">
        {{ sessionError }}
      </div>
      <RouterView />
    </main>
  </div>
</template>
