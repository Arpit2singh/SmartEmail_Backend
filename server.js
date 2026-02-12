import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://smart-email-frontend-eight.vercel.app"
];

app.use(cors());
app.use(express.json());

const MONGO_URL = process.env.MONGO_URL;
mongoose.connect(MONGO_URL).then(() => {
    console.log("MongoDB connected");
}).catch((err) => console.log("Db error", err));

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "ok", message: "Server is healthy" });
});

app.listen(5000, () => console.log('Backend running on port 5000'));