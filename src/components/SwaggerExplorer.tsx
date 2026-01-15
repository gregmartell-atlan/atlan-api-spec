import { useMemo, useEffect } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

// Import the bundled OpenAPI spec (multi-file YAML bundled into single JSON)
import atlanOpenApi from "../generated/atlan-openapi-bundled.json";

type OpenAPISpec = Record<string, unknown>;

interface SwaggerExplorerProps {
  baseUrl: string;
  apiToken: string;
}

function downloadJson(spec: OpenAPISpec, filename: string) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function normalizeBaseUrl(input: string) {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    return u.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Interactive Swagger UI for Atlan, backed by a spec generated from developer.atlan.com.
 */
export function SwaggerExplorer({ baseUrl, apiToken }: SwaggerExplorerProps) {
  const normalizedBaseUrl = useMemo(() => normalizeBaseUrl(baseUrl), [baseUrl]);

  const spec: OpenAPISpec = useMemo(() => {
    // Clone so Swagger UI can safely mutate without touching module state.
    const cloned = JSON.parse(JSON.stringify(atlanOpenApi)) as OpenAPISpec;
    if (normalizedBaseUrl) {
      (cloned as Record<string, unknown>).servers = [{ url: normalizedBaseUrl, description: "Your Atlan tenant" }];
    }
    return cloned;
  }, [normalizedBaseUrl]);

  // Listen for download event from parent
  useEffect(() => {
    const handler = () => downloadJson(spec, "atlan-openapi.json");
    window.addEventListener("download-openapi-spec", handler);
    return () => window.removeEventListener("download-openapi-spec", handler);
  }, [spec]);

  return (
    <div className="max-w-[1600px] mx-auto">
      <SwaggerUI
        spec={spec}
        docExpansion="list"
        defaultModelsExpandDepth={1}
        deepLinking={true}
        displayOperationId={false}
        filter={true}
        showExtensions={true}
        showCommonExtensions={true}
        requestInterceptor={(req: { url?: string; headers?: Record<string, string> }) => {
          const b = normalizedBaseUrl;
          if (b && req.url) {
            try {
              const u = new URL(req.url);
              req.url = `${b}${u.pathname}${u.search}`;
            } catch {
              // If it's already a relative URL, just prefix.
              if (req.url.startsWith("/")) req.url = `${b}${req.url}`;
            }
          }
          if (apiToken.trim()) {
            req.headers = req.headers ?? {};
            req.headers["Authorization"] = `Bearer ${apiToken.trim()}`;
          }
          return req;
        }}
      />
    </div>
  );
}
