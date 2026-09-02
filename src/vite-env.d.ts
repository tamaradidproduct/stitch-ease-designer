/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** See DEV_SKIP_AUTH in src/auth/useSession.ts. */
  readonly VITE_DEV_SKIP_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
