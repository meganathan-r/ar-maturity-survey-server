const express = require("express");
const fetch = require("node-fetch"); 
const cors = require("cors");

const app = express();
const PORT = 3000;

const allowedOrigins = [
  "https://growfin.ai", // production domain
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

app.post("/proxy/clay", async (req, res) => {
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
    console.log("send successfully");
    // Forward Clay response back to frontend
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Proxy request failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Hello from Proxy Server");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
