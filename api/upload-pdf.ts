import { IncomingForm } from "formidable";
import { createClient } from "@supabase/supabase-js";
import Cors from "cors";
import fs from "fs/promises";
import path from "path";

const cors = Cors({
  origin: ["https://growfin.ai", "http://localhost:5173"],
  methods: ["POST", "OPTIONS"],
});

function runMiddleware(req: any, res: any, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        console.error("Middleware error:", result);
        return reject(result);
      }
      console.log("Middleware passed");
      resolve(result);
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  try {
    console.log(`Incoming ${req.method} request`);

    await runMiddleware(req, res, cors);

    if (req.method === "OPTIONS") {
      console.log("CORS preflight request");
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      console.warn(`Method ${req.method} not allowed`);
      res.setHeader("Allow", ["POST", "OPTIONS"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const form = new IncomingForm();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Form parse error:", err);
        return res.status(400).json({ error: "Failed to parse form data" });
      }
      console.log("Form parsed:", { fields, files });

      try {
        const file = files.file;
        const sessionId = fields.sessionId;

        if (!file) {
          console.error("No file uploaded");
          return res.status(400).json({ error: "File is required" });
        }
        if (!sessionId || typeof sessionId !== "string") {
          console.error("Invalid or missing sessionId:", sessionId);
          return res.status(400).json({ error: "Valid sessionId is required" });
        }

        const filePath = (file as any).filepath || (file as any).path;
        if (!filePath) {
          console.error("File path missing");
          return res.status(400).json({ error: "File path missing" });
        }

        console.log(`Reading file buffer from: ${filePath}`);
        const fileBuffer = await fs.readFile(filePath);

        const mimeType = (file as any).mimetype || (file as any).type;
        console.log("File MIME type:", mimeType);
        if (mimeType !== "application/pdf") {
          console.error("Invalid file type:", mimeType);
          return res.status(400).json({ error: "Only PDF files allowed" });
        }

        const originalFilename = path.basename(
          (file as any).originalFilename || (file as any).name || "report.pdf"
        );
        console.log("Sanitized filename:", originalFilename);

        const storageFilePath = `${sessionId}/${originalFilename}`;
        console.log("Uploading to storage path:", storageFilePath);

        const { error: uploadError } = await supabase.storage
          .from("ar-maturity-survey")
          .upload(storageFilePath, fileBuffer, {
            cacheControl: "3600",
            upsert: true,
            contentType: "application/pdf",
          });

        if (uploadError) {
          console.error("Supabase upload error:", uploadError);
          return res.status(500).json({ error: "Upload to storage failed" });
        }
        console.log("Upload succeeded");

        await fs.unlink(filePath).catch((cleanupErr) => {
          console.warn("Failed to clean temp file:", cleanupErr);
        });

        const { data: publicURLData, error: urlError } = supabase.storage
          .from("ar-maturity-survey")
          .getPublicUrl(storageFilePath);

        if (urlError || !publicURLData?.publicUrl) {
          console.error("Error getting public URL:", urlError);
          return res.status(500).json({ error: "Failed to get public URL" });
        }
        console.log("Public URL:", publicURLData.publicUrl);

        return res.status(200).json({
          message: "File uploaded successfully",
          publicUrl: publicURLData.publicUrl,
        });
      } catch (uploadErr) {
        console.error("Upload processing error:", uploadErr);
        return res.status(500).json({ error: uploadErr.message || "Error" });
      }
    });
  } catch (generalErr) {
    console.error("General server error:", generalErr);
    res.status(500).json({ error: "Internal server error" });
  }
}
