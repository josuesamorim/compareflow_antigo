// src/app/api/revalidate/route.js
import { revalidateTag, revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST(request) {
  // 1. Validar se o método é POST (já garantido pelo nome da função, mas boa prática)
  
  // 2. Extrair o token do Header de Autorização (Bearer Token)
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.REVALIDATION_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json(
      { message: 'Não autorizado. Token de segurança inválido ou ausente.' }, 
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag');
  const path = searchParams.get('path');

  // Validação: precisa de ao menos um dos dois
  if (!tag && !path) {
    return NextResponse.json({ message: 'A tag ou o path é obrigatório.' }, { status: 400 });
  }

  try {
    // 3. O comando que limpa o cache na Vercel
    if (tag) {
      revalidateTag(tag);
      return NextResponse.json({ 
        revalidated: true, 
        now: new Date().toISOString(),
        message: `Cache invalidado para a tag: ${tag}` 
      });
    }

    if (path) {
      // O segundo parâmetro 'layout' garante que todas as páginas sob este path sejam limpas
      revalidatePath(path, 'layout');
      return NextResponse.json({ 
        revalidated: true, 
        now: new Date().toISOString(),
        message: `Cache invalidado para o path: ${path}` 
      });
    }

  } catch (err) {
    return NextResponse.json({ message: 'Erro ao revalidar', error: err.message }, { status: 500 });
  }
}