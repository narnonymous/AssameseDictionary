export default {
  async fetch(request, env, ctx) {
    // 🛡️ Enhanced CORS configuration including POST support
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json; charset=utf-8"
    };

    // Handle standard browser CORS preflight check
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const pathParts = pathname.split("/").filter(Boolean);

    // ====================================================
    // ⚡️ REAL-TIME SYNC ROUTE: POST -> /webhook/sync-kv
    // ====================================================
    if (request.method === "POST" && pathname === "/webhook/sync-kv") {
      try {
        // Secure token check against unauthorized manipulation
        const authHeader = request.headers.get("Authorization");
        if (authHeader !== `Bearer ${env.SUPABASE_WEBHOOK_SECRET}`) {
          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { 
            status: 401, 
            headers: corsHeaders 
          });
        }

        const payload = await request.json();
        const { event, table, record, old_record } = payload;

        // Verify the notification source target
        if (table === "dictionary") {
          const rawWord = record?.word || old_record?.word;
          
          if (!rawWord) {
            return new Response(JSON.stringify({ success: false, error: "Missing token anchor" }), { 
              status: 400, 
              headers: corsHeaders 
            });
          }

          const wordKey = rawWord.trim().toLowerCase();

          if (event === "DELETE") {
            // Instantly strip tracking entry from the edge namespace
            await env.DICTIONARY_KV.delete(wordKey);
          } else {
            // 💎 FIXED SCHEMA MATCH: Perfectly mirrors your local cloudflare_ready_kv.json structure
            const wordBody = {
              word: record.word,
              type: (record.type || "").trim(),
              transliteration: (record.transliteration || "").trim(),
              assamese_definition: (record.assamese_definition || "").trim(),
              english_definition: (record.english_definition || "").trim(),
              meaning: (record.meaning || "").trim(),
              example: (record.example || "").trim()
            };

            // Mirror modifications natively to Cloudflare Edge cache
            await env.DICTIONARY_KV.put(wordKey, JSON.stringify(wordBody));
          }
        }

        return new Response(JSON.stringify({ success: true, message: "Edge KV sync executed successfully" }), {
          status: 200,
          headers: corsHeaders
        });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // ====================================================
    // ROUTE 1: 🚀 EXISTING POST ENDPOINT -> /report-correction
    // ====================================================
    if (request.method === "POST" && pathname === "/report-correction") {
      try {
        const body = await request.json();
        const cleanWord = (body.word || "").trim().toLowerCase();

        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
        const RESEND_API_KEY = env.RESEND_API_KEY;
        const MY_PRIVATE_INBOX = env.MY_PRIVATE_INBOX;

        const supabasePayload = JSON.stringify({
            word: cleanWord,
            issue_type: body.issue_type,
            feedback: (body.feedback || "").trim()
        });

        const emailPayload = JSON.stringify({
            from: "Dictionary System <onboarding@resend.dev>",
            to: MY_PRIVATE_INBOX,
            subject: `🛠️ Correction Logged: '${body.word}'`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px;">
                    <h2 style="color: #0f766e; margin-top: 0;">New Translation Proposal</h2>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
                    <p><strong>Target Word:</strong> <span style="font-size: 16px; color: #111827;">${body.word}</span></p>
                    <p><strong>Error Type:</strong> <span style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-size: 12px;">${body.issue_type}</span></p>
                    <p><strong>User Notes:</strong></p>
                    <blockquote style="background: #f8fafc; border-left: 4px solid #0f766e; padding: 10px; margin: 0; font-style: italic;">
                        ${body.feedback}
                    </blockquote>
                </div>
            `
        });

        await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/correction_proposals`, {
                method: "POST",
                headers: {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                body: supabasePayload
            }),

            fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${RESEND_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: emailPayload
            })
        ]);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: corsHeaders
        });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            status: 500,
            headers: corsHeaders
        });
      }
    }

    // Block non-GET methods for everything else
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use GET." }), {
        status: 405,
        headers: corsHeaders
      });
    }

    // ====================================================
    // ROUTE 2: GET /search/:prefix (Autocomplete Suggestions)
    // ====================================================
    if (pathParts[0] === "search" && pathParts[1]) {
      const prefix = decodeURIComponent(pathParts[1]).trim().toLowerCase();
      
      const options = { prefix: prefix, limit: 15 };
      const listResult = await env.DICTIONARY_KV.list(options);
      
      const matches = listResult.keys.map(k => ({
        word: k.name,
        meaning: "Click to explore definition"
      }));

      return new Response(JSON.stringify(matches), {
        status: 200,
        headers: corsHeaders
      });
    }

    // ====================================================
    // ROUTE 3: GET /word/:query (Full Definition Values)
    // ====================================================
    if (pathParts[0] === "word" && pathParts[1]) {
      const targetWord = decodeURIComponent(pathParts[1]).trim().toLowerCase();
      const cachedEntry = await env.DICTIONARY_KV.get(targetWord);

      if (!cachedEntry) {
        return new Response(JSON.stringify({ found: false, message: "Word not found." }), {
          status: 404,
          headers: corsHeaders
        });
      }

      return new Response(cachedEntry, {
        status: 200,
        headers: corsHeaders
      });
    }

    // Standard Fallback Landing Root Verification response
    return new Response(JSON.stringify({ status: "online", service: "Dictionary Edge API Vault" }), {
      status: 200,
      headers: corsHeaders
    });
  }
};