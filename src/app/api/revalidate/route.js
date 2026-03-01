// src/app/api/revalidate/route.js
import { revalidateTag, revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request) {
  // ✅ Auth robusta (protege contra espaços/quebras de linha no env ou header)
  const authHeader = (request.headers.get("authorization") || "").trim();
  const secret = (process.env.REVALIDATION_SECRET || "").trim();
  const expectedToken = `Bearer ${secret}`;

  // ✅ Falha segura se o env não estiver configurado
  if (!secret) {
    return NextResponse.json(
      { message: "REVALIDATION_SECRET não está configurado no ambiente." },
      { status: 500 }
    );
  }

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json(
      { message: "Não autorizado. Token de segurança inválido ou ausente." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const tag = (searchParams.get("tag") || "").trim();
  const path = (searchParams.get("path") || "").trim();

  // Validação: precisa de ao menos um dos dois
  if (!tag && !path) {
    return NextResponse.json(
      { message: "A tag ou o path é obrigatório." },
      { status: 400 }
    );
  }

  try {
    // 1) Revalidação por TAG
    if (tag) {
      revalidateTag(tag);
      return NextResponse.json({
        revalidated: true,
        now: new Date().toISOString(),
        message: `Cache invalidado para a tag: ${tag}`,
      });
    }

    // 2) Revalidação por PATH
    // Observação: "layout" invalida também páginas sob o path
    if (path) {
      revalidatePath(path, "layout");
      return NextResponse.json({
        revalidated: true,
        now: new Date().toISOString(),
        message: `Cache invalidado para o path: ${path}`,
      });
    }

    // Não deve chegar aqui (pois validamos acima)
    return NextResponse.json(
      { message: "Nada para revalidar." },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { message: "Erro ao revalidar", error: err?.message || String(err) },
      { status: 500 }
    );
  }
}