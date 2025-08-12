import Cors from "cors";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client once
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Setup CORS middleware
const cors = Cors({
  origin: ["https://www.growfin.ai", "http://localhost:5173"],
  methods: ["POST", "OPTIONS"],
});

// Helper to run middleware in Vercel functions
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) reject(result);
      else resolve(result);
    });
  });
}

// Disable body parsing by default in Next.js API route config
export const config = {
  api: {
    bodyParser: false, // we need raw body for PDF upload
  },
};

export default async function handler(req, res) {
  await runMiddleware(req, res, cors);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const sessionId = req.headers["x-session-id"];
    if (!sessionId) {
      return res.status(400).json({ error: "Missing x-session-id header" });
    }

    // Read raw body (PDF file buffer)
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: "Invalid PDF file" });
    }

    const storageFilePath = `business-pdfs/${sessionId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("ar-maturity-survey")
      .upload(storageFilePath, fileBuffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf",
      });

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: "Failed to upload PDF" });
    }

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from("ar-maturity-survey")
        .createSignedUrl(storageFilePath, 60 * 60 * 24 * 365); // 1 year

    if (signedUrlError) {
      return res.status(500).json({ error: "Failed to generate signed URL" });
    }

    return res.json({
      message: "PDF uploaded successfully",
      url: signedUrlData.signedUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
