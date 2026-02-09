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

// Screen Wake Lock API types
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: 'screen';
  release(): Promise<void>;
}

interface WakeLock {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}

interface Navigator {
  readonly wakeLock?: WakeLock;
}
