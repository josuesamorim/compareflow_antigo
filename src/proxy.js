import { NextResponse } from 'next/server';

/**
 * MIDDLEWARE / PROXY
 * Responsável pela segurança das rotas de API e integridade das requisições.
 * No Next.js 16, ao usar o arquivo proxy.js, a função exportada deve se chamar 'proxy'.
 */
export function proxy(request) {
  const { pathname, searchParams } = request.nextUrl;

  // 1. PROTEÇÃO EXCLUSIVA PARA ROTAS DE API
  if (pathname.startsWith('/api')) {
    
    /**
     * EXCEÇÃO PARA REVALIDAÇÃO DE CACHE (NOVO)
     * Permite que o script revalidate.js limpe o cache da Vercel.
     * Utiliza o REVALIDATION_SECRET via Bearer Token.
     */
    if (pathname === '/api/revalidate') {
      const authHeader = request.headers.get("authorization");
      const secretToken = process.env.REVALIDATION_SECRET;

      if (secretToken && authHeader === `Bearer ${secretToken}`) {
        return NextResponse.next();
      }

      return new NextResponse(
        JSON.stringify({ 
          error: "Unauthorized",
          message: "Falha na autenticação de revalidação."
        }),
        { 
          status: 401, 
          headers: { 'content-type': 'application/json' } 
        }
      );
    }

    /**
     * EXCEÇÃO PROTEGIDA PARA O GOOGLE SHOPPING FEED
     * Exigimos um token secreto via query string (?t=...) para evitar que
     * terceiros descubram e baixem sua base de dados de produtos.
     * O Google Merchant Center permite cadastrar a URL com este parâmetro.
     */
    if (pathname === '/api/google-shopping') {
      const token = searchParams.get('t');
      
      // Busca a hash exclusivamente das variáveis de ambiente (.env)
      const secretToken = process.env.FEED_TOKEN;

      // Só permite o acesso se o token existir no .env E for igual ao enviado na URL
      if (secretToken && token === secretToken) {
        return NextResponse.next();
      }

      // Se o token estiver errado, ausente ou se o .env não estiver configurado
      return new NextResponse(
        JSON.stringify({ 
          error: "Forbidden",
          message: "Acesso negado ao feed de dados."
        }),
        { 
          status: 403, 
          headers: { 'content-type': 'application/json' } 
        }
      );
    }

    /**
     * EXCEÇÃO PARA DEBUG DE PRODUTOS
     * Permite o acesso à rota de diagnóstico de integridade do banco de dados.
     * Utiliza o mesmo FEED_TOKEN para simplificar a gestão de acesso seguro.
     */
    if (pathname === '/api/debug-products') {
      const token = searchParams.get('t');
      const secretToken = process.env.FEED_TOKEN;

      if (secretToken && token === secretToken) {
        return NextResponse.next();
      }

      return new NextResponse(
        JSON.stringify({ 
          error: "Forbidden",
          message: "Acesso negado ao relatório de diagnóstico."
        }),
        { 
          status: 403, 
          headers: { 'content-type': 'application/json' } 
        }
      );
    }

    /**
     * EXCEÇÃO PARA BING INDEXNOW
     * Permite que serviços externos autorizados (Cron Jobs ou Scripts) 
     * disparem a indexação de URLs sem passar pela trava de 'referer'.
     */
    if (pathname === '/api/indexnow') {
      const authHeader = request.headers.get("authorization");
      const secretToken = process.env.INDEXNOW_SECRET;

      // Valida o Bearer Token configurado nas variáveis de ambiente
      if (secretToken && authHeader === `Bearer ${secretToken}`) {
        return NextResponse.next();
      }

      return new NextResponse(
        JSON.stringify({ 
          error: "Unauthorized",
          message: "Falha na autenticação do IndexNow."
        }),
        { 
          status: 401, 
          headers: { 'content-type': 'application/json' } 
        }
      );
    }

    const referer = request.headers.get('referer');
    const host = request.headers.get('host');
    const internalToken = request.headers.get('x-internal-token');
    
    /**
     * PASSAPORTE PARA ACESSO INTERNO (SERVER-SIDE)
     * Validamos o cabeçalho 'x-internal-request' configurado no Server Component.
     */
    const isInternal = request.headers.get('x-internal-request') === 'true';

    // A. Permite requisições internas (Server-to-API)
    if (isInternal) {
      return NextResponse.next();
    }

    // B. Bloqueio de Acesso Direto (Browser-to-API sem origem válida)
    // Se não houver referer ou se o referer não for o próprio host, bloqueia 401.
    if (!referer || !referer.includes(host)) {
      return new NextResponse(
        JSON.stringify({ 
          error: "Unauthorized Access",
          message: "Acesso permitido apenas através da interface oficial."
        }),
        { 
          status: 401, 
          headers: { 'content-type': 'application/json' } 
        }
      );
    }
  }

  /**
   * 2. CONTINUIDADE PARA PÁGINAS E CATEGORIAS
   * Para qualquer rota que não seja API (como /category/...), o middleware 
   * deve retornar .next() imediatamente para evitar o erro 404.
   */
  return NextResponse.next();
}

/**
 * CONFIGURAÇÃO DO MATCHER
 * O matcher define em quais rotas o middleware será executado.
 * Ajustado para garantir que as rotas de página não sejam interceptadas indevidamente.
 * Adicionada negação para arquivos estáticos para evitar falsos positivos de 401 (como favicon).
 */
export const config = {
  matcher: [
    /*
     * Aplica apenas em rotas de API.
     * Ignora arquivos com extensões (favicon.ico, svg, png, etc) dentro de /api se houver.
     */
    '/api/((?!.*\\.).*)',
  ],
};