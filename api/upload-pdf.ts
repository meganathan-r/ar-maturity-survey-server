import { IncomingForm } from "formidable";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false, // disable Next.js body parsing
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
      return res.status(500).json({ error: "Failed to parse form" });
    }

    try {
      const file = files.file;
      const sessionId = fields.sessionId;

      if (!file || !sessionId) {
        return res.status(400).json({ error: "Missing file or sessionId" });
      }

      // Read file buffer (formidable saves uploaded file to temp path)
      const fs = require("fs");
      const fileBuffer = fs.readFileSync(file.filepath);

      const filePath = `${sessionId}/${file.originalFilename}`;

      const { error: uploadError } = await supabase.storage
        .from("ar-maturity-survey")
        .upload(filePath, fileBuffer, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.mimetype,
        });

      if (uploadError) throw uploadError;

      const { data: publicURLData, error: urlError } = supabase.storage
        .from("ar-maturity-survey")
        .getPublicUrl(filePath);

      if (urlError) throw urlError;

      res.status(200).json({ publicUrl: publicURLData.publicUrl });
    } catch (uploadError) {
      console.error(uploadError);
      res.status(500).json({ error: uploadError.message });
    }
  });
}
