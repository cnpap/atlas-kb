<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink class="brand" to="/">ATLAS KB</RouterLink>
      <nav class="nav-links">
        <RouterLink to="/">Overview</RouterLink>
        <RouterLink to="/kb">Spaces</RouterLink>
        <RouterLink to="/ask">Ask</RouterLink>
      </nav>
    </header>

    <main class="app-main"><RouterView /></main>
  </div>
</template>
