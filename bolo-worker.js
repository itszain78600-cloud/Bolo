// Bolo server (Cloudflare Worker). Keeps your Groq and Gemini keys secret.
// Settings → Variables and Secrets:
//   GROQ_KEY       (Secret)  your Groq key
//   GEMINI_KEY     (Secret)  your Gemini key (optional)
//   ACCESS_CODE    (Secret)  a code you give to friends, e.g. 4 words
//   ALLOWED_ORIGIN (Text)    https://itszain78600-cloud.github.io

const GROQ_PATHS = ["models", "chat/completions", "audio/transcriptions", "audio/speech"];

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] || ""),
      "Access-Control-Allow-Headers": "Content-Type, X-Bolo-Code",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin"
    };
    const fail = (status, message) =>
      new Response(JSON.stringify({ error: { message } }), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!allowed.includes(origin)) return fail(403, "This app address is not allowed.");
    if (!env.ACCESS_CODE || req.headers.get("X-Bolo-Code") !== env.ACCESS_CODE) return fail(401, "Wrong access code.");

    const url = new URL(req.url);
    const headers = new Headers();
    let target;
    if (url.pathname.startsWith("/groq/")) {
      const path = url.pathname.slice(6);
      if (!GROQ_PATHS.includes(path)) return fail(404, "Unknown request.");
      if (!env.GROQ_KEY) return fail(500, "The server has no Groq key yet.");
      target = "https://api.groq.com/openai/v1/" + path;
      headers.set("Authorization", "Bearer " + env.GROQ_KEY);
    } else if (url.pathname.startsWith("/gemini/")) {
      const path = url.pathname.slice(8);
      if (!(path === "models" || /^models\/[\w.-]+:generateContent$/.test(path))) return fail(404, "Unknown request.");
      if (!env.GEMINI_KEY) return fail(500, "The server has no Gemini key.");
      target = "https://generativelanguage.googleapis.com/v1beta/" + path + url.search;
      headers.set("x-goog-api-key", env.GEMINI_KEY);
    } else {
      return fail(404, "Unknown request.");
    }

    const ct = req.headers.get("Content-Type");
    if (ct) headers.set("Content-Type", ct);
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" ? undefined : await req.arrayBuffer()
    });
    const out = new Response(upstream.body, upstream);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  }
};
