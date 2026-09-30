import { Router } from "express";
import multer from "multer";
import { hashFileBuffer } from "../services/hash.js";
import { registerOnChain, verifyOnChain } from "../services/contract.js";

const upload = multer({ storage: multer.memoryStorage() });
export const mediaRouter = Router();

mediaRouter.post("/register", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const sourceName = req.body.sourceName || "Unknown Publisher";
    const editHistory = req.body.editHistory || "original upload";

    const hash = hashFileBuffer(req.file.buffer);
    const result = await registerOnChain(hash, sourceName, editHistory);

    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.name === "AlreadyRegisteredError") {
        return res.status(409).json({ error: "This exact file is already registered" });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to register media", details: error.message });
    }
});

mediaRouter.post("/verify", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const hash = hashFileBuffer(req.file.buffer);
    const result = await verifyOnChain(hash);

    res.json({ hash, ...result });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: "Failed to verify media", details: error.message });
  }
});
