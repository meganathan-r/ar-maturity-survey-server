import { IncomingForm } from "formidable";
import { createClient } from "@supabase/supabase-js";
import Cors from "cors";
import fs from "fs/promises"; // async fs
import path from "path";

// Initialize CORS middleware
const cors = Cors({
  origin: ["https://growfin.ai", "http://localhost:5173"],
  methods: ["POST", "OPTIONS"],
});

// Helper to run middleware (Next.js / Vercel)
function runMiddleware(req: any, res: any, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export const config = {
  api: {
    bodyParser: false, // disable Next.js built-in parser to use formidable
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  try {
    await runMiddleware(req, res, cors);

    if (req.method === "OPTIONS") {
      // CORS preflight
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST", "OPTIONS"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const form = new IncomingForm();

    // Parse form data (file + fields)
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Form parse error:", err);
        return res.status(400).json({ error: "Failed to parse form data" });
      }

      try {
        const file = files.file;
        const sessionId = fields.sessionId;

        // Basic validation
        if (!file) {
          return res.status(400).json({ error: "File is required" });
        }
        if (!sessionId || typeof sessionId !== "string") {
          return res.status(400).json({ error: "Valid sessionId is required" });
        }

        // Get filepath (handle formidable v2+ and older versions)
        const filePath = (file as any).filepath || (file as any).path;
        if (!filePath) {
          return res.status(400).json({ error: "File path missing" });
        }

        // Read file buffer asynchronously
        const fileBuffer = await fs.readFile(filePath);

        // Validate mimetype
        const mimeType = (file as any).mimetype || (file as any).type;
        if (mimeType !== "application/pdf") {
          return res.status(400).json({ error: "Only PDF files are allowed" });
        }

        // Sanitize filename to avoid path traversal
        const originalFilename = path.basename(
          (file as any).originalFilename || (file as any).name || "report.pdf"
        );

        // Define storage file path
        const storageFilePath = `${sessionId}/${originalFilename}`;

        // Upload file buffer to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("ar-maturity-survey")
          .upload(storageFilePath, fileBuffer, {
            cacheControl: "3600",
            upsert: true,
            contentType: "application/pdf",
          });

        if (uploadError) {
          console.error("Supabase upload error:", uploadError);
          return res
            .status(500)
            .json({ error: "Failed to upload file to storage" });
        }

        // Clean up temp file after read
        await fs.unlink(filePath).catch((cleanupErr) => {
          console.warn("Failed to cleanup temp file:", cleanupErr);
        });

        // Get public URL of uploaded file
        const { data: publicURLData, error: urlError } = supabase.storage
          .from("ar-maturity-survey")
          .getPublicUrl(storageFilePath);

        if (urlError) {
          console.error("Error getting public URL:", urlError);
          return res
            .status(500)
            .json({ error: "Failed to get public URL for file" });
        }

        if (!publicURLData?.publicUrl) {
          return res.status(500).json({ error: "Public URL is undefined" });
        }

        // Success response
        return res.status(200).json({
          message: "File uploaded successfully",
          publicUrl: publicURLData.publicUrl,
          filePath: storageFilePath,
        });
      } catch (uploadErr) {
        console.error("Upload processing error:", uploadErr);
        return res.status(500).json({ error: uploadErr.message || "Error" });
      }
    });
  } catch (generalErr) {
    console.error("Middleware or general error:", generalErr);
    res.status(500).json({ error: "Internal server error" });
  }
}
