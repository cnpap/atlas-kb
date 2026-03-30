/// <reference types="vite/client" />
/// <reference types="vue/macros-global" />

declare const __ATLAS_KB_API_PORT__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, never>, Record<string, never>>;
  export default component;
}
