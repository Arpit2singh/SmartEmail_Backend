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

const emailSchema = new mongoose.Schema({
    admin: { type: String, default: null },
    recipient: { type: String, default: null },
    trackingId: { type: String, default: null },
    password: { type: String, default: null },
    status: { type: String, default: 'sent' },
    openedAt: { type: Date, default: null },
    count: { type: Number, default: -1 },
    subject: String,
});
const Email = mongoose.model('Email', emailSchema);

app.post('/api/instance', async (req, res) => {
    try {
        const { email } = req.body;
        const checkUserInstance = await Email.findOne(
            { admin: email },
            {},
            { sort: { _id: -1 } }
        );
        if (!checkUserInstance) {
            console.log("creating user instance");
            const createEmailInstance = await Email.create({
                admin: email, recipient: null, trackingId: null, subject: null, password: null
            });
            res.status(200).json({ message: "user instance created successfully", instance: createEmailInstance });
        }
        else {
            console.log("user instance already exists");
            res.status(200).json({ message: "user instance already exists", instance: checkUserInstance });
        }
    } catch (error) {
        console.log("user not created");
    }
});

app.listen(5000, () => console.log('Backend running on port 5000'));