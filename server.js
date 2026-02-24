
import express from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';
import {Resend} from 'resend' 

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
        const latestEmail = await Email.findOne(
            { admin: from },
            {},
            { sort: { _id: -1 } }
        );
        let appPass = null;
        if (latestEmail && latestEmail.password) {
            appPass = CryptoJS.AES.decrypt(latestEmail.password, process.env.SECRET_KEY).toString(CryptoJS.enc.Utf8);
        }


      const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // VERY IMPORTANT
    auth: {
        user: from,
        pass: appPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
});

       await transporter.verify();
        const trackingUrl = `${process.env.BASE_URL}/media/${trackingId}`;
        const htmlWithPixel = `
    <p>${body}</p>
    <br>
    <img src="${trackingUrl}" width="1" height="1" alt="" border="0" style="display:block;" />
    `
        const info = await transporter.sendMail({
            from: from,
            to: to,
            subject: subject, // Plain-text version of the message
            text: body, 
            html: htmlWithPixel, // HTML version of the message
        });

        if (info) {
            console.log("message send successfully");
             await Email.create({
            admin: from,
            recipient: to,
            trackingId: trackingId,
            subject: subject,
            password: latestEmail.password
        });
        }
        else {
            console.log("message sending failed");
            return res.status(500).json({ success: false, message: "Failed to send email" });
        }
        res.json({
            success: true, message: "Email sent with tracking!",
            trackingId: trackingId,
            trackingUrl: trackingUrl
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Failed to send the mail" });
    }
})





const transparentPixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'
);


app.get(`/api/media/:id`, async (req, res) => {
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
        const checkUser = await Email
            .findOne({ admin: email })
            .sort({ _id: -1 });
        if (checkUser && checkUser.password) {
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
        const { email, password } = req.body;
        console.log(email)
        const hashedPassword = CryptoJS.AES.encrypt(password, process.env?.SECRET_KEY).toString();
        const response = await Email.findOne({ admin: email }, {},
            { sort: { _id: -1 } })
        if (response) {

            const updateResponse = await Email.findOneAndUpdate({ _id: response._id }, { $set: { password: hashedPassword } }, { new: true })
            console.log("email found and pass updated:", updateResponse);
            return res.status(200).json({ flag: true, message: "password updated successfully" });
        } else {
            console.log("email not found or password not set");
            return res.status(404).json({
                flag: false,
                message: "No email instance found"
            });
        }

    } catch (error) {

        res.status(401).json({ flag: false, message: "user not found , or something went wromg while updating the password" })
    }
})


app.post('/api/publicEmail' , async(req,res)=>{
  try {
      const resend = new Resend(process.env.RESEND_KEY) 
      const {admin , to  , subject , text , name} = req.body ; 
  
      const trackingId = uuidv4() ; 
      const trackingUrl = `${process.env.BASE_URL}/media/${trackingId}`; 
      const htmlWithPixel = `
              <p>${text}</p>
              <br>
              <img src="${trackingUrl}" width="1" height="1" alt="" border="0" style="display:block;" />
          `;
  
    const { data , error } = await resend.emails.send({
    from: `${name}'s email <onboarding@resend.dev>`,
    to: to ,
    replyTo: admin ,
    subject: subject ,
    html: htmlWithPixel ,
  });
  
  console.log(`Email ${data} has been sent`);
  if(error){
    console.error("Resend Error:", error);
    return res.status(500).json({ success: false, message: "Failed to send via Resend" });
  }

    if (data) {
            console.log("message send successfully");
             await Email.create({
            admin: from,
            recipient: to,
            trackingId: trackingId,
            subject: subject,
            password: "send through resend" ,
        });
        }
        res.json({
            success: true, message: "Email sent with tracking!",
            trackingId: trackingId,
            trackingUrl: trackingUrl
        });

  } catch (error) {
    console.error("Error in /api/publicEmail:", error);
     res.status(401).json({
    message : "message has not been send" , 
    flag : false ,
  })
  }
})



if (process.env.NODE_ENV !== 'production') {
    app.listen(5000, () => console.log('Backend running on port 5000'));
}

// Export the app for Vercel's serverless environment
export default app;