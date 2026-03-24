import { transform } from "esbuild";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
const productionHardenPlugin = (): Plugin => ({
  name: "production-harden",
  apply: "build",
  enforce: "post",
  async renderChunk(code, chunk) {
    if (!chunk.fileName.endsWith(".js")) {
      return null;
    }

    const protectionPrelude =
      "!function(){if(!import.meta.env||!import.meta.env.PROD)return;const e=()=>{document.documentElement.setAttribute('data-protected','true')},t=()=>{const t=window.outerWidth-window.innerWidth>160,n=window.outerHeight-window.innerHeight>160;if(t||n){e();return}document.documentElement.removeAttribute('data-protected')};window.addEventListener('contextmenu',e=>e.preventDefault()),window.addEventListener('keydown',t=>{const n=t.key.toLowerCase(),o='f12'===n||t.ctrlKey&&t.shiftKey&&['i','j','c'].includes(n)||t.ctrlKey&&['u','s'].includes(n);o&&(t.preventDefault(),t.stopPropagation())}),setInterval(t,1200),t()}();";

    const result = await transform(`${protectionPrelude}${code}`, {
      loader: "js",
      minify: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      legalComments: "none",
      charset: "ascii",
      target: "es2020",
      drop: ["console"],
    });

    return {
      code: result.code,
      map: null,
    };
  },
});

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    hmr: {
      overlay: true,
    },
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    cssMinify: true,
    target: "es2020",
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
  },
  esbuild: mode === "production" ? { drop: ["console"], legalComments: "none" } : undefined,
  plugins: [react(), productionHardenPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
