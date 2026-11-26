import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

// Dedicated Authentication selection; no application dotenv loading.
export default defineConfig({
  envDir: false,
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    env: { VITE_API_BASE_URL: "https://api.auth.example.test/api" },
    include: ["src/lib/admin-auth.test.ts","src/contexts/AuthContext.test.tsx","src/pages/admin/AdminLogin.test.tsx"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
