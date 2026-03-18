import { createRouter, createWebHistory } from "vue-router";
import { hasAuthToken } from "@/lib/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "landing",
      component: () => import("@/features/landing/views/LandingView.vue"),
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/features/auth/views/LoginView.vue"),
    },
    {
      path: "/kb",
      name: "knowledge-spaces",
      component: () =>
        import("@/features/knowledge/views/KnowledgeSpacesView.vue"),
      meta: { requiresAuth: true, title: "知识库列表" },
    },
    {
      path: "/kb/:spaceId",
      name: "space-detail",
      component: () => import("@/features/knowledge/views/SpaceDetailView.vue"),
      meta: { requiresAuth: true, title: "知识库管理" },
    },
    {
      path: "/ask",
      name: "ask-knowledge",
      component: () => import("@/features/knowledge/views/AskView.vue"),
      meta: { requiresAuth: true, title: "智能问答" },
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !hasAuthToken()) {
    return {
      name: "login",
      query: {
        redirect: to.fullPath,
      },
    };
  }

  if (to.name === "login" && hasAuthToken()) {
    return {
      name: "knowledge-spaces",
    };
  }

  return true;
});

export { router };
