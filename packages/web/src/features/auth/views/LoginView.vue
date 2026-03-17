<script setup lang="ts">
  import { ref } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import { getErrorMessage, loginRequest } from "@/lib/api-client";
  import { setLoginSession } from "@/lib/auth";

  const route = useRoute();
  const router = useRouter();

  const email = ref("admin@atlas-kb.local");
  const password = ref("atlas-kb-dev");
  const loading = ref(false);
  const errorMessage = ref("");

  async function submitLogin() {
    loading.value = true;
    errorMessage.value = "";

    try {
      const session = await loginRequest({
        email: email.value,
        password: password.value,
      });
      const redirect =
        typeof route.query.redirect === "string" ? route.query.redirect : "/kb";

      setLoginSession(session);
      await router.replace(redirect);
    } catch (error) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      loading.value = false;
    }
  }
</script>

<template>
  <section class="page">
    <div class="content-grid">
      <div class="content-main panel">
        <div class="panel-body form-shell">
          <div class="eyebrow">Workspace Login</div>
          <h1>Sign in to manage the knowledge base.</h1>
          <p class="lede">
            Atlas KB now protects spaces, uploads, and question answering behind
            a workspace session.
          </p>

          <div class="field">
            <label for="email-input">Email</label>
            <input id="email-input" v-model="email" class="input" type="email">
          </div>

          <div class="field">
            <label for="password-input">Password</label>
            <input
              id="password-input"
              v-model="password"
              class="input"
              type="password"
            >
          </div>

          <div class="cta-row">
            <button
              class="button button-primary"
              type="button"
              @click="submitLogin"
            >
              {{ loading ? "Signing in..." : "Sign in" }}
            </button>
          </div>

          <div v-if="errorMessage" class="status status-error">
            {{ errorMessage }}
          </div>
        </div>
      </div>

      <aside class="content-side panel panel-strong">
        <div class="panel-body stack">
          <h2>Default Dev Credentials</h2>
          <div class="status">
            <div>
              <strong>Email:</strong>
              <span class="mono">admin@atlas-kb.local</span>
            </div>
            <div>
              <strong>Password:</strong> <span class="mono">atlas-kb-dev</span>
            </div>
          </div>
          <p class="muted">
            Override these values with
            <span class="mono">ATLAS_KB_ADMIN_EMAIL</span>
            and <span class="mono">ATLAS_KB_ADMIN_PASSWORD</span>.
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>
