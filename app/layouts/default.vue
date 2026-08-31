<template>
  <div class="flex min-h-screen flex-col bg-default text-default">
    <header class="border-b border-default">
      <div class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <NuxtLink to="/" class="font-semibold">Tradelog</NuxtLink>
        <UColorModeButton />
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <slot />
    </main>
  </div>
</template>
