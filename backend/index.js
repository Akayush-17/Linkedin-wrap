const express = require('express');
const bodyParser = require('body-parser')
const cors = require('cors')
const { google } = require("googleapis")

require("dotenv").config();

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: process.env.FRONTEND_URL }));


const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    "http://localhost:3000"
);
const gmail = google.gmail({ version: "v1", auth: oauth2Client });

app.get("/api/oauth/login", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    });
    res.json({ authUrl });
});

app.get("/api/oauth/callback", async (req, res) => {
    const code = req.query.code;
  
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
  
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      const userEmail = profile.data.emailAddress;
  
      res.json({ message: "Authentication successful!", email: userEmail, tokens });
    } catch (error) {
      console.error("Error during OAuth callback:", error);
      res.status(400).send("Authentication failed");
    }
  });

  app.get("/api/emails", async (req, res) => {
    try {
        const { tokens } = req.query;
        oauth2Client.setCredentials(tokens);

        // Search for emails from the past year with job-related keywords
        const response = await gmail.users.messages.list({
            userId: "me",
            q: `after:${new Date().getFullYear()}/01/01 
                (subject:("job application" OR "applied" OR "application" OR 
                         "offer" OR "interview" OR "opportunity" OR 
                         "rejection" OR "thank you" OR "position" OR 
                         "candidature" OR "recruitment" OR "hiring") 
                 OR from:(@linkedin.com OR @greenhouse.io OR @lever.co OR 
                         @workday.com OR @jobvite.com OR @hired.com))
                -category:promotions -category:social`
        });

        const messages = response.data.messages || [];
        const emailData = [];

        for (const message of messages) {
            const msg = await gmail.users.messages.get({
                userId: "me",
                id: message.id,
                format: "full",
            });

            const headers = msg.data.payload.headers;
            const subject = headers.find(header => header.name.toLowerCase() === 'subject')?.value || '';
            const from = headers.find(header => header.name.toLowerCase() === 'from')?.value || '';
            const date = headers.find(header => header.name.toLowerCase() === 'date')?.value;
            const snippet = msg.data.snippet;

            // Function to decode email body
            const getBody = (payload) => {
                if (payload.body.data) {
                    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
                }
                
                if (payload.parts) {
                    for (let part of payload.parts) {
                        if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
                            return Buffer.from(part.body.data, 'base64').toString('utf-8');
                        }
                    }
                }
                return '';
            };

            const body = getBody(msg.data.payload);

            // Convert all text to lowercase for easier matching
            const subjectLower = subject.toLowerCase();
            const snippetLower = snippet.toLowerCase();
            const bodyLower = body.toLowerCase();
            const textToSearch = `${subjectLower} ${snippetLower} ${bodyLower}`;

            // Define keyword patterns for each status
            const patterns = {
                'Rejected': [
                    'regret', 'not moving forward', 'not selected', 'unsuccessful',
                    'other candidates', 'not proceeding', 'rejected', 'rejection',
                    'not successful', 'not be considered', 'decided to proceed with other'
                ],
                'Offer': [
                    'offer letter', 'job offer', 'formal offer', 'pleased to offer',
                    'welcome aboard', 'welcome to the team'
                ],
                'Interview': [
                    'interview invitation', 'schedule an interview', 'interview with',
                    'interview schedule', 'interview confirmation', 'technical interview',
                    'first round', 'second round', 'final round', 'meet the team'
                ],
                'Application Received': [
                    'application received', 'thank you for applying', 'received your application',
                    'application submitted', 'confirm receipt', 'thank you for your interest'
                ],
                'Applied': [
                    'applied', 'application', 'submitted', 'position', 'role',
                    'job', 'opportunity', 'candidature'
                ]
            };

            // Determine email status based on patterns
            let status = 'Other';
            for (const [categoryStatus, keywords] of Object.entries(patterns)) {
                if (keywords.some(keyword => textToSearch.includes(keyword))) {
                    status = categoryStatus;
                    break;
                }
            }

            // Extract company name from email address
            const companyName = from.match(/@([^.]+)/)?.[1] || 
                              from.match(/([^<]+)/)?.[1]?.trim() || 
                              'Unknown Company';

            const emailInfo = {
                id: msg.data.id,
                subject,
                from,
                companyName,
                status,
                date: new Date(date).toISOString(),
                snippet: snippet.replace(/\s+/g, ' ').trim(), // Clean up whitespace
                labels: msg.data.labelIds || []
            };

            emailData.push(emailInfo);
        }

        // Sort emails by date (newest first)
        emailData.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Group emails by status
        const groupedEmails = emailData.reduce((acc, email) => {
            acc[email.status] = acc[email.status] || [];
            acc[email.status].push(email);
            return acc;
        }, {});

        res.json({
            summary: {
                total: emailData.length,
                byStatus: Object.fromEntries(
                    Object.entries(groupedEmails).map(([status, emails]) => 
                        [status, emails.length]
                    )
                )
            },
            groupedEmails
        });

    } catch (error) {
        console.error("Error fetching emails:", error);
        res.status(500).json({
            error: "Error fetching emails",
            details: error.message
        });
    }
  })
  
  app.listen(process.env.PORT, () =>
    console.log(`Server running on http://localhost:${process.env.PORT}`)
  );