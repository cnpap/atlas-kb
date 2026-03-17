import { createRouter, createWebHistory } from "vue-router";
import { hasAuthToken } from "@/lib/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "landing",
      component: () => import("../features/landing/views/LandingView.vue"),
    },
    {
      path: "/kb",
      name: "knowledge-spaces",
      meta: {
        requiresAuth: true,
      },
      component: () =>
        import("../features/knowledge/views/KnowledgeSpacesView.vue"),
    },
    {
      path: "/kb/:spaceId",
      name: "knowledge-space-detail",
      meta: {
        requiresAuth: true,
      },
      component: () =>
        import("../features/knowledge/views/SpaceDetailView.vue"),
    },
    {
      path: "/ask",
      name: "knowledge-ask",
      meta: {
        requiresAuth: true,
      },
      component: () => import("../features/knowledge/views/AskView.vue"),
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../features/auth/views/LoginView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
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
