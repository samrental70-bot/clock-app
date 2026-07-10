import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, mode }) => {
  const channel =
    process.env.VITE_APP_CHANNEL ||
    process.env.OPERA_APP_CHANNEL ||
    (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production"
      ? "development"
      : command === "serve" || mode !== "production"
        ? "development"
        : "production");
  const isDevelopmentApp = channel !== "production";
  const appName = isDevelopmentApp ? "OPERA.AI Development" : "OPERA.AI";
  const manifestHref = isDevelopmentApp ? "/manifest-development.json" : "/manifest.json";
  const iconHref = isDevelopmentApp ? "/favicon-development.svg" : "/favicon.svg";
  const appleIconHref = isDevelopmentApp ? "/icon-development-192.png" : "/icon-192.png";
  const themeColor = isDevelopmentApp ? "#172554" : "#0f172a";
  const statusBarColor = isDevelopmentApp ? "black-translucent" : "default";

  return {
    define: {
      "import.meta.env.VITE_OPERA_APP_CHANNEL": JSON.stringify(channel),
      "import.meta.env.VITE_OPERA_APP_NAME": JSON.stringify(appName),
    },
    server: {
      proxy: {
        // Local API harness (scripts/dev-api-server.mjs); dev-serve only, ignored by builds.
        "/api": {
          target: `http://localhost:${process.env.OPERA_DEV_API_PORT || 5999}`,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "opera-app-channel-html",
        transformIndexHtml(html) {
          return html
            .replace(/<title>.*?<\/title>/, `<title>${appName}</title>`)
            .replace(/href="\/favicon\.svg"/, `href="${iconHref}"`)
            .replace(/href="\/manifest\.json"/, `href="${manifestHref}"`)
            .replace(/content="#0f172a"/, `content="${themeColor}"`)
            .replace(
              "</head>",
              [
                `    <meta name="application-name" content="${appName}" />`,
                `    <meta name="apple-mobile-web-app-capable" content="yes" />`,
                `    <meta name="mobile-web-app-capable" content="yes" />`,
                `    <meta name="apple-mobile-web-app-title" content="${appName}" />`,
                `    <meta name="apple-mobile-web-app-status-bar-style" content="${statusBarColor}" />`,
                `    <link rel="apple-touch-icon" href="${appleIconHref}" />`,
                "  </head>",
              ].join("\n")
            );
        },
      },
    ],
  };
});
