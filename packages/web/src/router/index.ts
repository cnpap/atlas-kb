import { createRouter, createWebHistory } from "vue-router";
import MainLayout from "@/layouts/MainLayout.vue";
import { initializeAuthSession } from "@/lib/auth-session";
import { getAuthToken } from "@/lib/auth-storage";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/app",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/features/auth/views/LoginView.vue"),
      meta: {
        title: "登录",
        public: true,
      },
    },
    {
      path: "/kb",
      redirect: "/app?panel=library",
    },
    {
      path: "/kb/:spaceId",
      redirect: (to) =>
        `/app?group=${encodeURIComponent(String(to.params.spaceId))}&panel=library`,
    },
    {
      path: "/app",
      component: MainLayout,
      meta: {
        requiresAuth: true,
      },
      children: [
        {
          path: "",
          name: "app-workspace",
          component: () => import("@/features/app/views/WorkspaceView.vue"),
          meta: {
            title: "Atlas KB",
            requiresAuth: true,
          },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const token = getAuthToken();
  const isPublicRoute = Boolean(to.meta.public);

  if (isPublicRoute) {
    if (!token) {
      return true;
    }

    const session = await initializeAuthSession();
    if (session) {
      const next =
        typeof to.query.next === "string" && to.query.next.trim()
          ? to.query.next
          : "/app";
      return next;
    }

    return true;
  }

  if (!to.meta.requiresAuth) {
    return true;
  }

  if (!token) {
    return {
      path: "/login",
      query: {
        next: to.fullPath,
      },
    };
  }

  const session = await initializeAuthSession();

  if (!session) {
    return {
      path: "/login",
      query: {
        next: to.fullPath,
      },
    };
  }

  return true;
});

router.afterEach((to) => {
  document.title =
    typeof to.meta.title === "string" && to.meta.title.trim()
      ? to.meta.title
      : "Atlas KB";
});

export { router };
