import express from "express";
import cors from "cors";
import { mediaRouter } from "./routes/media.js";
import { config } from "./config.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/media", mediaRouter);

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.listen(config.port, () => {
    console.log(`MediaChain backend listing on http://localhost:${config.port}`);
});