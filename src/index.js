export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use GET." }), {
        status: 405,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // Route 1: Autocomplete live search list -> GET /search/:prefix
    if (pathParts[0] === "search" && pathParts[1]) {
      const prefix = decodeURIComponent(pathParts[1]).trim().toLowerCase();
      
      // Request keys starting with the typed characters from KV (limited to 15 for speed)
      const options = { prefix: prefix, limit: 15 };
      const listResult = await env.DICTIONARY_KV.list(options);
      
      // Format into a clean match array for your frontend sidebar dropdown
      const matches = listResult.keys.map(k => ({
        word: k.name,
        meaning: "Click to explore definition"
      }));

      return new Response(JSON.stringify(matches), {
        status: 200,
        headers: corsHeaders
      });
    }

    // Route 2: Get full word definition details -> GET /word/:query
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

    return new Response(JSON.stringify({ status: "online", service: "Dictionary Edge API Vault" }), {
      status: 200,
      headers: corsHeaders
    });
  }
};