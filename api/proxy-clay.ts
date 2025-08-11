import Cors from "cors";

// Initialize CORS middleware
const cors = Cors({
  origin: ["https://growfin.ai", "http://localhost:5173"],
  methods: ["POST", "GET"],
});

// Helper to run middleware in Next.js / Vercel
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default async function handler(req, res) {
  await runMiddleware(req, res, cors);

  if (req.method === "POST") {
    try {
      const clayUrl =
        "https://api.clay.com/v3/sources/webhook/pull-in-data-from-a-webhook-8a82cda5-b61a-4928-ae06-ba8fb644c231";

      const response = await fetch(clayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();

      return res.status(response.status).json(data);
    } catch (error) {
      console.error("Proxy error:", error);
      return res.status(500).json({ error: "Proxy request failed" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
