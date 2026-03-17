import { createRouter, createWebHistory } from "vue-router";

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
      component: () =>
        import("../features/knowledge/views/KnowledgeSpacesView.vue"),
    },
    {
      path: "/kb/:spaceId",
      name: "knowledge-space-detail",
      component: () =>
        import("../features/knowledge/views/SpaceDetailView.vue"),
    },
    {
      path: "/ask",
      name: "knowledge-ask",
      component: () => import("../features/knowledge/views/AskView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

export { router };
