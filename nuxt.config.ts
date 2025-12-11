// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxt/ui'],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'Palserver Online Map',
      htmlAttrs: { lang: 'en' }
    }
  },
  css: [
    '~/assets/css/main.css'
  ],
  runtimeConfig: {
    authSecret: process.env.NITRO_AUTH_SECRET || 'dev-secret-change-me',
    palworld: {
      host: process.env.NUXT_PALWORLD_HOST || '127.0.0.1',
      port: Number(process.env.NUXT_PALWORLD_PORT || 3333),
      password: process.env.NUXT_PALWORLD_PASSWORD || ''
    },
    public: {
      palworldHost: process.env.NUXT_PALWORLD_HOST || '127.0.0.1',
      palworldPort: Number(process.env.NUXT_PALWORLD_PORT || 3333)
    }
  }
})
