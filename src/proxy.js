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
    /**
     * EXCEÇÃO PARA REVALIDAÇÃO DE CACHE
     * Permite que o script revalidate.js limpe o cache da Vercel via Bearer Token.
     * ✅ robusto contra whitespace no env ou header
     */
    if (pathname === "/api/revalidate") {
      const authHeader = (request.headers.get("authorization") || "").trim();
      const secretToken = (process.env.REVALIDATION_SECRET || "").trim();

      if (secretToken && authHeader === `Bearer ${secretToken}`) {
        return NextResponse.next();
      }

      return new NextResponse(
        JSON.stringify({
          error: "Unauthorized",
          message: "Falha na autenticação de revalidação.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        }
      );
    }

    /**
     * EXCEÇÃO PROTEGIDA PARA O GOOGLE SHOPPING FEED
     * Protege com token via query string (?t=...)
     */
    if (pathname === "/api/google-shopping") {
      const token = (searchParams.get("t") || "").trim();
      const secretToken = (process.env.FEED_TOKEN || "").trim();

      if (secretToken && token === secretToken) {
        return NextResponse.next();
      }

      return new NextResponse(
        JSON.stringify({
          error: "Forbidden",
          message: "Acesso negado ao feed de dados.",
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        }
      );
    }

    /**
     * EXCEÇÃO PARA DEBUG DE PRODUTOS
     * Protege com o mesmo FEED_TOKEN via query string (?t=...)
     */
    if (pathname === "/api/debug-products") {
      const token = (searchParams.get("t") || "").trim();
      const secretToken = (process.env.FEED_TOKEN || "").trim();

      if (secretToken && token === secretToken) {
        return NextResponse.next();
      }

      return new NextResponse(
        JSON.stringify({
          error: "Forbidden",
          message: "Acesso negado ao relatório de diagnóstico.",
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        }
      );
    }

    /**
     * EXCEÇÃO PARA BING INDEXNOW
     * Permite autenticação via Bearer Token
     */
    if (pathname === "/api/indexnow") {
      const authHeader = (request.headers.get("authorization") || "").trim();
      const secretToken = (process.env.INDEXNOW_SECRET || "").trim();

      if (secretToken && authHeader === `Bearer ${secretToken}`) {
        return NextResponse.next();
      }

      return new NextResponse(
        JSON.stringify({
          error: "Unauthorized",
          message: "Falha na autenticação do IndexNow.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        }
      );
    }

    /**
     * PASSAPORTE PARA ACESSO INTERNO (SERVER-SIDE)
     * Validamos o cabeçalho 'x-internal-request' configurado no Server Component.
     */
    const isInternal = request.headers.get("x-internal-request") === "true";
    if (isInternal) {
      return NextResponse.next();
    }

    /**
     * BLOQUEIO DE ACESSO DIRETO (Browser-to-API sem origem válida)
     */
    const referer = request.headers.get("referer") || "";
    const host = request.headers.get("host") || "";

    // Se não houver referer ou se o referer não for o próprio host, bloqueia 401.
    // ✅ compara com origem esperada (mais robusto que includes(host) puro)
    const isSameOrigin =
      referer && host
        ? (() => {
            try {
              const refUrl = new URL(referer);
              return refUrl.host === host;
            } catch {
              // Se vier referer inválido, considera não autorizado
              return false;
            }
          })()
        : false;

    if (!isSameOrigin) {
      return new NextResponse(
        JSON.stringify({
          error: "Unauthorized Access",
          message: "Acesso permitido apenas através da interface oficial.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        }
      );
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