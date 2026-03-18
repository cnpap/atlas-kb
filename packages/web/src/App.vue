<script setup lang="ts">
  import { computed, onMounted } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import { fetchCurrentSession } from "@/lib/api-client";
  import { clearAuthSession, hasAuthToken, replaceSession } from "@/lib/auth";
  import MainLayout from "@/layouts/MainLayout.vue";

  const route = useRoute();
  const router = useRouter();
  const useDashboardLayout = computed(() => Boolean(route.meta.requiresAuth));

  async function syncSession() {
    if (!hasAuthToken()) {
      return;
    }

    try {
      const session = await fetchCurrentSession();
      replaceSession(session);
    } catch {
      clearAuthSession();
      if (route.meta.requiresAuth) {
        await router.replace({
          name: "login",
          query: { redirect: route.fullPath },
        });
      }
    }
  }

  onMounted(() => {
    void syncSession();
  });
</script>

<template>
  <UApp>
    <MainLayout v-if="useDashboardLayout"> <RouterView /> </MainLayout>
    <RouterView v-else />
  </UApp>
</template>
