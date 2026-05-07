import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const channel =
  process.env.VITE_APP_CHANNEL ||
  process.env.OPERA_APP_CHANNEL ||
  (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" ? "development" : "production");
const isDevelopmentApp = channel !== "production";
const appName = isDevelopmentApp ? "OPERA.AI Development" : "OPERA.AI";
const manifestHref = isDevelopmentApp ? "/manifest-development.json" : "/manifest.json";
const iconHref = isDevelopmentApp ? "/favicon-development.svg" : "/favicon.svg";
const appleIconHref = isDevelopmentApp ? "/icon-development-192.png" : "/icon-192.png";
const themeColor = isDevelopmentApp ? "#172554" : "#0f172a";

export default defineConfig({
  define: {
    "import.meta.env.VITE_OPERA_APP_CHANNEL": JSON.stringify(channel),
    "import.meta.env.VITE_OPERA_APP_NAME": JSON.stringify(appName),
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
            `    <link rel="apple-touch-icon" href="${appleIconHref}" />\n  </head>`
          );
      },
    },
  ],
});
