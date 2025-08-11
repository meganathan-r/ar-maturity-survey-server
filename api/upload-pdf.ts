import { createClient } from "@supabase/supabase-js";
import { IncomingForm } from "formidable";

export const config = {
  api: {
    bodyParser: false, // Disables Next.js default body parser for file upload
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const form = new IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ error: "Form parsing failed" });
    }

    const sessionId = fields.sessionId;
    const file = files.file;

    if (!sessionId || !file) {
      return res.status(400).json({ error: "Missing sessionId or file" });
    }

    // Read file buffer from the uploaded file
    const fs = require("fs");
    const buffer = fs.readFileSync(file.filepath);

    const filePath = `${sessionId}/${file.originalFilename}`;

    // Upload buffer to Supabase storage
    const { error } = await supabase.storage
      .from("ar-maturity-survey")
      .upload(filePath, buffer, {
        cacheControl: "3600",
        upsert: true,
        contentType: "application/pdf",
      });

    if (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ error: error.message });
    }

    // Get public URL
    const { data: publicURLData, error: urlError } = supabase.storage
      .from("ar-maturity-survey")
      .getPublicUrl(filePath);

    if (urlError || !publicURLData.publicUrl) {
      return res.status(500).json({ error: "Failed to get public URL" });
    }

    return res.json({ publicUrl: publicURLData.publicUrl, filePath });
  });
}
