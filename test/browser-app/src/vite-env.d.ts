/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_LOGS_API_KEY: string
  readonly VITE_APP_LOGS_ENDPOINT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 