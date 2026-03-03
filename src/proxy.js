// src/middleware.js  (ou proxy.js / proxy.ts conforme seu projeto)
import { NextResponse } from "next/server";

/**
 * MIDDLEWARE / PROXY
 * Segurança das rotas de API e integridade das requisições.
 * No Next.js 16, ao usar proxy.js, a função exportada deve se chamar "proxy".
 */
export function proxy(request) {
  const { pathname, searchParams } = request.nextUrl;

  // 1) PROTEÇÃO EXCLUSIVA PARA ROTAS DE API
  if (pathname.startsWith("/api")) {
    // Helpers locais (não remove funções existentes; só organiza e deixa robusto)
    const json = (status, payload) =>
      new NextResponse(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });

    const header = (name) => (request.headers.get(name) || "").trim();
    const env = (name) => (process.env[name] || "").trim();

    // Bearer robusto: aceita "Bearer <token>" com qualquer espaçamento e case-insensitive
    const getBearerToken = () => {
      const auth = header("authorization");
      if (!auth) return "";
      const m = auth.match(/^Bearer\s+(.+)$/i);
      return (m?.[1] || "").trim();
    };

    // Token via querystring (?t=...)
    const getQueryToken = () => (searchParams.get("t") || "").trim();

    /**
     * EXCEÇÃO PARA REVALIDAÇÃO DE CACHE
     * Permite que o script revalidate.js limpe o cache da Vercel via Bearer Token.
     * ✅ robusto contra whitespace no env ou header
     */
    if (pathname === "/api/revalidate") {
      const token = getBearerToken();
      const secretToken = env("REVALIDATION_SECRET");

      if (secretToken && token && token === secretToken) {
        return NextResponse.next();
      }

      return json(401, {
        error: "Unauthorized",
        message: "Falha na autenticação de revalidação.",
      });
    }

    /**
     * EXCEÇÃO PROTEGIDA PARA O GOOGLE SHOPPING FEED
     * Protege com token via query string (?t=...)
     */
    if (pathname === "/api/google-shopping") {
      const token = getQueryToken();
      const secretToken = env("GOOGLE_SHOPPING_TOKEN");

      if (secretToken && token && token === secretToken) {
        return NextResponse.next();
      }

      return json(403, {
        error: "Forbidden",
        message: "Acesso negado ao feed de dados.",
      });
    }

    /**
     * EXCEÇÃO PARA DEBUG DE PRODUTOS
     */
    if (pathname === "/api/debug-products") {
      const token = getQueryToken();
      const secretToken = env("GOOGLE_SHOPPING_TOKEN");

      if (secretToken && token && token === secretToken) {
        return NextResponse.next();
      }

      return json(403, {
        error: "Forbidden",
        message: "Acesso negado ao relatório de diagnóstico.",
      });
    }

    /**
     * EXCEÇÃO PARA BING INDEXNOW
     * Permite autenticação via Bearer Token
     */
    if (pathname === "/api/indexnow") {
      const token = getBearerToken();
      const secretToken = env("INDEXNOW_SECRET");

      if (secretToken && token && token === secretToken) {
        return NextResponse.next();
      }

      return json(401, {
        error: "Unauthorized",
        message: "Falha na autenticação do IndexNow.",
      });
    }

    /**
     * PASSAPORTE PARA ACESSO INTERNO (SERVER-SIDE)
     * Validamos o cabeçalho 'x-internal-request' configurado no Server Component.
     */
    const isInternal = header("x-internal-request") === "true";
    if (isInternal) {
      return NextResponse.next();
    }

    /**
     * BLOQUEIO DE ACESSO DIRETO (Browser-to-API sem origem válida)
     * ✅ Permite chamadas sem referer quando for:
     *   - server-to-server / cron / GitHub Actions / Postman (com Authorization)
     * ✅ Se não houver Authorization, exige same-origin.
     */
    const referer = request.headers.get("referer") || "";
    const host = request.headers.get("host") || "";

    const hasAuth = Boolean(header("authorization")); // qualquer auth já sinaliza request "intencional"
    const isSameOrigin =
      referer && host
        ? (() => {
            try {
              const refUrl = new URL(referer);
              return refUrl.host === host;
            } catch {
              return false;
            }
          })()
        : false;

    // Se veio com Authorization (Bearer), não precisa de referer (Postman/cron)
    if (!hasAuth && !isSameOrigin) {
      return json(401, {
        error: "Unauthorized Access",
        message: "Acesso permitido apenas através da interface oficial.",
      });
    }
  }

  // 2) CONTINUIDADE PARA PÁGINAS E CATEGORIAS
  return NextResponse.next();
}

/**
 * CONFIGURAÇÃO DO MATCHER
 * Aplica apenas em rotas /api (ignora arquivos com extensões).
 */
export const config = {
  matcher: ["/api/((?!.*\\.).*)"],
};