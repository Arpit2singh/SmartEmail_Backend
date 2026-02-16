import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcrypt';
import CryptoJS from 'crypto-js';
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

const smtpConfigSchema = new mongoose.Schema({
    admin: { type: String, required: true, unique: true },
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, default: false },
    user: { type: String, default: "" },
    pass: { type: String, default: "" },
});
const SmtpConfig = mongoose.model('SmtpConfig', smtpConfigSchema);

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

app.post('/api/checkUser', async (req, res) => {
    try {
        const { email } = req.body;
        const config = await SmtpConfig.findOne({ admin: email });
        if (config) {
            res.status(200).json({ exists: true });
        }
        else {
            res.status(200).json({ exists: false });
        }
    } catch (error) {
        console.error("Check user error:", error);
        res.status(500).json({ error: "Server error checking user" });
    }
});

app.post('/api/passSet', async (req, res) => {
    try {
        const { email, host, port, secure, user, password } = req.body;
        console.log("Configuring SMTP for:", email);
        
        let hashedPassword = "";
        if (password) {
            hashedPassword = CryptoJS.AES.encrypt(password, process.env?.SECRET_KEY).toString();
        }

        const updateResponse = await SmtpConfig.findOneAndUpdate(
            { admin: email },
            { 
                $set: { 
                    host: host || "smtp.gmail.com",
                    port: port || 465,
                    secure: secure !== undefined ? secure : true,
                    user: user || "",
                    pass: hashedPassword
                } 
            },
            { new: true, upsert: true }
        );

        console.log("SMTP Config updated:", updateResponse);
        return res.status(200).json({ flag: true, message: "SMTP configuration updated successfully" });

    } catch (error) {
        console.error("Error setting SMTP config:", error);
        res.status(401).json({ flag: false, message: "user not found , or something went wrong while updating the SMTP config" });
    }
});

app.listen(5000, () => console.log('Backend running on port 5000'));