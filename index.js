const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const app = express();
const PORT = 3000;

const allowedOrigins = [
  "https://www.growfin.ai", // production domain
  "http://localhost:5173", // local dev domain
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  //   credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use("/upload-pdf", express.raw({ type: "application/pdf", limit: "10mb" }));

app.post("/upload-pdf", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"];
    if (!sessionId) {
      return res.status(400).json({ error: "Missing x-session-id header" });
    }

    if (!req.body || !(req.body instanceof Buffer)) {
      return res.status(400).json({ error: "Invalid PDF file" });
    }

    const fileBuffer = req.body;
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
        .createSignedUrl(storageFilePath, 60 * 60 * 24 * 365); // valid for 1 year

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
});

app.get("/", (req, res) => {
  res.send("Hello from Proxy Server");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
