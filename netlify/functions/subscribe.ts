const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CORS_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: CORS_HEADERS,
  });
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  let email = "";
  try {
    const parsed = await request.json();
    email = typeof parsed?.email === "string" ? parsed.email.trim() : "";
  } catch {
    return json(400, { error: "invalid_json" });
  }

  if (!EMAIL_RE.test(email)) {
    return json(400, { error: "invalid_email" });
  }

  // Wire up your own persistence here (email list, CRM, DB).
  console.log("subscription received", { email });

  return json(200, { ok: true });
};
