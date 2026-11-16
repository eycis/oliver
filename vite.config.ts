import { defineConfig, loadEnv } from "vite";
import { build } from "esbuild";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const config = JSON.parse(env.VITE_FIREBASE_CONFIG || "{}");
  const publicKeys = new Set([
    "apiKey",
    "authDomain",
    "projectId",
    "messagingSenderId",
    "appId",
    "storageBucket",
    "measurementId",
    "databaseURL",
  ]);
  if (Object.keys(config).some((key) => !publicKeys.has(key)))
    throw new Error(
      "VITE_FIREBASE_CONFIG must contain only public web app configuration, never a service account.",
    );
  const worker = async () =>
    (
      await build({
        entryPoints: ["src/firebase-sw.ts"],
        bundle: true,
        write: false,
        minify: true,
        format: "iife",
        target: "es2022",
        define: { __FIREBASE_CONFIG__: JSON.stringify(config) },
      })
    ).outputFiles[0].text;
  return {
    base: env.VITE_BASE_PATH || "/",
    server: {
      fs: {
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem}",
          "**/.git/**",
          "**/.private/**",
          "**/*serviceAccount*.json",
          "**/*service-account*.json",
          "**/supabase/vzkazy-*.csv",
        ],
      },
    },
    plugins: [
      {
        name: "firebase-service-worker",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.split("?")[0] !== "/sw.js") return next();
            try {
              res.setHeader("Content-Type", "application/javascript");
              res.setHeader("Cache-Control", "no-cache");
              res.end(await worker());
            } catch (error) {
              next(error);
            }
          });
        },
        async generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "sw.js",
            source: await worker(),
          });
        },
      },
    ],
  };
});
