
import express from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://smart-email-frontend-eight.vercel.app"
];

app.use(cors())
app.use(express.json());

const MONGO_URL = process.env.MONGO_URL ;
mongoose.connect(MONGO_URL).then(() => {
    console.log("MongoDB connected")
}).catch((err) => (console.log("Db error", err)));

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
            })
            res.status(200).json({ message: "user instance created successfully", instance: createEmailInstance });
        }
        else {
            console.log("user instance already exists");
            res.status(200).json({ message: "user instance already exists", instance: checkUserInstance });
        }
    } catch (error) {
        console.log("user not created")
    }
})




app.post('/api/send', async (req, res) => {
    try {
        const { from, to, subject, body } = req.body;
        const trackingId = uuidv4();
        
        const smtpConfig = await SmtpConfig.findOne({ admin: from });
        if (!smtpConfig) {
            return res.status(400).json({ success: false, message: "SMTP configuration not found. Please configure SMTP first." });
        }

        let appPass = null;
        if (smtpConfig.pass) {
            appPass = CryptoJS.AES.decrypt(smtpConfig.pass, process.env.SECRET_KEY).toString(CryptoJS.enc.Utf8);
        }

        let transporterOptions = {};
        
        // Auto-optimize for Gmail configurations
        if (smtpConfig.host && smtpConfig.host.includes('gmail.com')) {
            transporterOptions = {
                service: 'gmail',
                auth: {
                    user: smtpConfig.user,
                    pass: appPass,
                },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 10000,
            };
        } else {
            transporterOptions = {
                host: smtpConfig.host,
                port: smtpConfig.port,
                secure: smtpConfig.secure,
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 10000,
            };
            if (smtpConfig.user) {
                transporterOptions.auth = {
                    user: smtpConfig.user,
                    pass: appPass,
                };
            }
        }

        const transporter = nodemailer.createTransport(transporterOptions);
        await transporter.verify();

        const trackingUrl = `${process.env.BASE_URL || `http://${req.headers.host}`}/media/${trackingId}`;
        const htmlWithPixel = `
    <p>${body}</p>
    <br>
    <img src="${trackingUrl}" width="1" height="1" alt="" border="0" style="display:block;" />
    `;

        const info = await transporter.sendMail({
            from: smtpConfig.user || from,
            to: to,
            subject: subject,
            text: body,
            html: htmlWithPixel,
        });

        if (info) {
            console.log("message sent successfully");
            await Email.create({
                admin: from,
                recipient: to,
                trackingId: trackingId,
                subject: subject,
                password: smtpConfig.pass
            });
        }
        else {
            console.log("message sending failed");
            return res.status(500).json({ success: false, message: "Failed to send email" });
        }

        res.json({
            success: true,
            message: "Email sent with tracking!",
            trackingId: trackingId,
            trackingUrl: trackingUrl
        });

    } catch (error) {
        console.error("SMTP Send Error:", error);
        res.status(500).json({ error: "Failed to send the mail. Check your SMTP settings." });
    }
})





const transparentPixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'
);


app.get([`/api/media/:id`, `/media/:id`], async (req, res) => {
    try {
        const trackingId = req.params.id;
        const response = await Email.findOneAndUpdate(
            { trackingId: trackingId },
            {
                $set: { status: 'opened', openedAt: new Date() },
                $inc: { count: 1 },
            }
        )
        console.log(`Email ${trackingId} Opened!  `, response)

        res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Content-Length': transparentPixel.length,
            'Cache-Control': 'no-store, no-cache'
        });
        res.end(transparentPixel);

    } catch (error) {
        res.end(transparentPixel);
    }
})

app.post('/api/emails', async (req, res) => {
    try {
        const { email } = req.body;
        const allEmail = await Email.find({ admin: email }).sort({ _id: -1 });
        res.status(200).json(allEmail);
    } catch (error) {
        console.error("Error fetching emails:", error);
        res.status(500).json({ error: "Failed to fetch emails" });
    }
})

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
})

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
        res.status(401).json({ flag: false, message: "user not found , or something went wrong while updating the SMTP config" })
    }
})


app.post('/api/ai/generate', async (req, res) => {
    try {
        const { prompt, action, text, tone } = req.body;
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ success: false, message: "OpenAI API Key is not configured in backend environment." });
        }

        let systemPrompt = "You are a professional email assistant. Help write or refine emails.";
        let userPrompt = "";

        if (action === 'generate') {
            systemPrompt = "You are a professional email writer. Generate a complete, polished email body based on the instruction. Do not include placeholders like '[Your Name]' or signature details. Output ONLY the email body itself.";
            userPrompt = `Write an email draft based on this request:\n\n${prompt}`;
        } else if (action === 'improve') {
            systemPrompt = "You are an email enhancer. Rewrite the text to make it more professional, grammatically correct, and engaging. Do not include subject lines or signature placeholders.";
            userPrompt = `Refine this email content:\n\n${text}`;
        } else if (action === 'tone') {
            systemPrompt = `You are a professional email writer. Rewrite the text to have a strictly "${tone}" tone. Maintain original intent, but change sentence structure and vocabulary to match. Do not include placeholders.`;
            userPrompt = `Change tone to ${tone} for:\n\n${text}`;
        } else if (action === 'subject') {
            systemPrompt = "You are a copywriter. Generate exactly 3 direct, engaging email subject lines based on the email body text. Return ONLY the 3 subject lines, one per line. Do not number or quote them. No comments.";
            userPrompt = `Generate 3 subject lines for:\n\n${text}`;
        } else {
            return res.status(400).json({ success: false, message: "Invalid AI action request" });
        }

        const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            })
        });

        if (!openAiResponse.ok) {
            const errorDetails = await openAiResponse.json();
            console.error("OpenAI API direct error details:", errorDetails);
            return res.status(500).json({ success: false, message: errorDetails?.error?.message || "OpenAI API responded with an error." });
        }

        const data = await openAiResponse.json();
        const result = data.choices[0].message.content.trim();

        return res.json({ success: true, result });
    } catch (error) {
        console.error("AI Generation server error:", error);
        return res.status(500).json({ success: false, message: "Internal server error during AI operations." });
    }
});


// Resend integration removed. Custom SMTP takes its place.



if (process.env.NODE_ENV !== 'production') {
    app.listen(5000, () => console.log('Backend running on port 5000'));
}

// Export the app for Vercel's serverless environment
export default app;