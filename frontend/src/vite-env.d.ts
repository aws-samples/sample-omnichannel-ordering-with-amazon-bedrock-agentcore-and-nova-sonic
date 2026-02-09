/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USER_POOL_ID: string
  readonly VITE_CLIENT_ID: string
  readonly VITE_IDENTITY_POOL_ID: string
  readonly VITE_REGION: string
  readonly VITE_WEBSOCKET_URL: string
  readonly VITE_RUNTIME_ARN: string
  readonly VITE_MAP_NAME: string
  readonly VITE_PLACE_INDEX_NAME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
