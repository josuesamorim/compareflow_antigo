// src/app/api/revalidate/route.js
// ✅ Improved: supports BOTH tag/path in a single request (optional), more robust logging,
// keeps your behavior, does not remove functions, and remains safe.

import { revalidateTag, revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request) {
  const authHeader = (request.headers.get("authorization") || "").trim();
  const secret = (process.env.REVALIDATION_SECRET || "").trim();
  const expectedToken = `Bearer ${secret}`;

  if (!secret) {
    return NextResponse.json(
      { message: "REVALIDATION_SECRET não está configurado no ambiente." },
      { status: 500 },
    );
  }

  if (!authHeader || authHeader !== expectedToken) {
    return NextResponse.json(
      { message: "Não autorizado. Token de segurança inválido ou ausente." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const tag = (searchParams.get("tag") || "").trim();
  const path = (searchParams.get("path") || "").trim();

  // Accept optional JSON body to allow bulk requests later (keeps backward compat)
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const tags = Array.isArray(body?.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const paths = Array.isArray(body?.paths) ? body.paths.map((p) => String(p).trim()).filter(Boolean) : [];

  // Backward-compat: support querystring single values
  if (tag) tags.push(tag);
  if (path) paths.push(path);

  // Validate: at least one
  if (!tags.length && !paths.length) {
    return NextResponse.json(
      { message: "A tag ou o path é obrigatório." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const report = {
    revalidated: true,
    now,
    tags: [],
    paths: [],
  };

  try {
    // Tags
    for (const t of new Set(tags)) {
      revalidateTag(t);
      report.tags.push(t);
    }

    // Paths
    for (const p of new Set(paths)) {
      // layout -> purge subtree
      revalidatePath(p, "layout");
      report.paths.push(p);
    }

    return NextResponse.json({
      ...report,
      message: `Cache invalidado. Tags=${report.tags.length} Paths=${report.paths.length}`,
    });
  } catch (err) {
    return NextResponse.json(
      { message: "Erro ao revalidar", error: err?.message || String(err), report },
      { status: 500 },
    );
  }
}