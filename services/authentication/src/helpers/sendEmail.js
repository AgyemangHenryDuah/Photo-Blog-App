const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const sesClient = new SESClient({});

const APP_DOMAIN = process.env.APP_DOMAIN;
const SES_EMAIL_SOURCE = `no-reply@${APP_DOMAIN}`;

exports.sendEmail = async (email, firstName, templateType) => {
    const templates = {
        signup: {
            subject: `Welcome to ${APP_DOMAIN}!`,
            htmlContent: `
                <div class="header">
                    <h1>Welcome to ${APP_DOMAIN}!</h1>
                </div>
                <div class="content">
                    <p>Hello ${firstName},</p>
                    <p>Thank you for signing up! We're excited to have you join our platform.</p>
                    <p>Your account has been successfully verified and is now ready to use.</p>
                    <p>If you need any assistance, please don't hesitate to contact our support team.</p>
                    <a href="https://${APP_DOMAIN}/login" class="button">Log in</a>
                    <p>Best regards,<br>The Photo Blog App Team</p>
                </div>
            `,
        },
        login: {
            subject: `Login Successful`,
            htmlContent: `
                <div class="header">
                    <h1>You just logged into ${APP_DOMAIN}</h1>
                </div>
                <div class="content">
                    <p>Hello ${firstName},</p>
                    <p>You recently logged into our platform.</p>
                    <p>If you did not perform this action, please contact our support team immediately.</p>
                    <p>Best regards,<br>The Photo Blog App Team</p>
                </div>
            `,
        },
    };

    const template = templates[templateType];

    const htmlWrapper = `
        <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .footer { font-size: 12px; text-align: center; margin-top: 20px; color: #999; }
                    .button { 
                        display: inline-block; 
                        background-color: #4285f4; 
                        color: white !important; 
                        text-decoration: none; 
                        padding: 12px 24px; 
                        border-radius: 4px; 
                        margin: 20px 0; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    ${template.htmlContent}
                    <div class="footer">
                        <p>© ${new Date().getFullYear()} ${APP_DOMAIN}. All rights reserved.</p>
                    </div>
                </div>
            </body>
        </html>
    `;

    const emailParams = {
        Destination: {
            ToAddresses: [email],
        },
        Message: {
            Body: {
                Html: {
                    Charset: 'UTF-8',
                    Data: htmlWrapper,
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: template.subject,
            },
        },
        Source: SES_EMAIL_SOURCE,
        ReplyToAddresses: [SES_EMAIL_SOURCE],
    };

    try {
        await sesClient.send(new SendEmailCommand(emailParams));
        console.log(`Email sent to ${email}`);
    } catch (error) {
        console.error(`Error sending email:`, error);
    }
};
