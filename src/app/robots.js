export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/product/',   // Garante o rastreio das páginas de produto
        '/category/',  // ADICIONADO: Garante o rastreio das páginas de categoria
      ],
      disallow: [
        '/api/',       // Protege o restante da sua rota de dados interna
        '/admin/',     // Protege sua área restrita
        '/*?*',        // BLOQUEIA parâmetros de busca (evita indexar lixo como ?sort=price)
        '/search',     // Se você tiver uma página de busca, não precisa indexar
      ],
    },
    sitemap: 'https://compareflow.club/sitemap.xml',
  };
}