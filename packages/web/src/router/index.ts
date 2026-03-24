import { createRouter, createWebHistory } from "vue-router";
import MainLayout from "@/layouts/MainLayout.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/app",
    },
    {
      path: "/login",
      redirect: "/app",
    },
    {
      path: "/ask",
      redirect: "/app",
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
      path: "/app/overview",
      redirect: "/app",
    },
    {
      path: "/app/search",
      redirect: "/app?panel=citations",
    },
    {
      path: "/app/chat",
      redirect: "/app",
    },
    {
      path: "/app/collections",
      redirect: "/app?panel=library",
    },
    {
      path: "/app/collections/:collectionId",
      redirect: (to) =>
        `/app?group=${encodeURIComponent(String(to.params.collectionId))}&panel=library`,
    },
    {
      path: "/app/imports",
      redirect: "/app?panel=library",
    },
    {
      path: "/app/settings",
      redirect: "/app?panel=library",
    },
    {
      path: "/app",
      component: MainLayout,
      children: [
        {
          path: "",
          name: "app-workspace",
          component: () => import("@/features/app/views/WorkspaceView.vue"),
          meta: {
            title: "个人知识库",
          },
        },
      ],
    },
  ],
});

router.afterEach(() => {
  document.title = "个人知识库";
});

export { router };
