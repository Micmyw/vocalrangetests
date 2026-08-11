import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import {
  PRODUCTION_ANALYTICS_PLACEHOLDER,
  renderProductionAnalyticsTags,
} from "./src/seo/analyticsTags.ts";

const isProductionDeployment = process.env.VERCEL_ENV === "production";

function robotsMetaPlugin(): Plugin {
  return {
    name: "vocal-range-robots-meta",
    enforce: "pre",
    transformIndexHtml(html) {
      return html
        .replace("__HOMEPAGE_ROBOTS__", isProductionDeployment ? "index,follow" : "noindex,nofollow")
        .replace("__PRIVACY_ROBOTS__", isProductionDeployment ? "noindex,follow" : "noindex,nofollow");
    },
  };
}

function privacyRoutePlugin(): Plugin {
  const installRewrite = (middlewares: { use: (handler: (
    request: { url?: string },
    response: unknown,
    next: () => void,
  ) => void) => void }) => {
    middlewares.use((request, _response, next) => {
      if (request.url) {
        request.url = request.url.replace(/^\/privacy(?=\?|$)/, "/privacy/index.html");
      }
      next();
    });
  };

  return {
    name: "vocal-range-privacy-route",
    configureServer(server) {
      installRewrite(server.middlewares);
    },
    configurePreviewServer(server) {
      installRewrite(server.middlewares);
    },
  };
}

function productionAnalyticsPlugin(): Plugin {
  return {
    name: "vocal-range-production-analytics",
    enforce: "pre",
    transformIndexHtml(html) {
      return html.replace(
        PRODUCTION_ANALYTICS_PLACEHOLDER,
        renderProductionAnalyticsTags(isProductionDeployment),
      );
    },
  };
}

export default defineConfig({
  plugins: [privacyRoutePlugin(), robotsMetaPlugin(), productionAnalyticsPlugin()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        privacy: fileURLToPath(new URL("./privacy/index.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
