import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import ui from "@nuxt/ui/vue-plugin";
import "./assets/css/tailwind.css";

const app = createApp(App);

app.use(router);
app.use(ui);
app.mount("#app");
