/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_ENABLE_GOOGLE_AUTH_ON_LOCALHOST?: string;
  readonly VITE_AUTH_LOGIN_PATH?: string;
  readonly VITE_AUTH_LOGIN_VERIFY_PATH?: string;
  readonly VITE_AUTH_REGISTER_PATH?: string;
  readonly VITE_AUTH_REGISTER_VERIFY_PATH?: string;
  readonly VITE_AUTH_FORGOT_PASSWORD_PATH?: string;
  readonly VITE_AUTH_RESET_PASSWORD_PATH?: string;
  readonly VITE_AUTH_GOOGLE_PATH?: string;
  readonly VITE_AUTH_LOGOUT_PATH?: string;
  readonly VITE_AUTH_ME_PATH?: string;
  readonly VITE_AUTH_PROFILE_PATH?: string;
  readonly VITE_AUTH_UPDATE_PASSWORD_PATH?: string;
  readonly VITE_ADMIN_OVERVIEW_PATH?: string;
  readonly VITE_ADMIN_USERS_PATH?: string;
  readonly VITE_ADMIN_TRANSACTIONS_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
