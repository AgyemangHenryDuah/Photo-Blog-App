const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const sesClient = new SESClient({});

const APP_DOMAIN = process.env.APP_DOMAIN;
const SES_EMAIL_SOURCE = `no-reply@${APP_DOMAIN}`;

exports.sendEmail = async (email, firstName, templateType) => {
    const templates = {
        start: {
            subject: `Photo Upload Initiated | Photopia`,
            htmlContent: `
                <div class="header">
                    <h1 style="color: blue">Photo Processing...</h1>
                </div>
                <div class="content">
                    <p>Hello ${firstName},</p>
                    <p>We are adding some finishing touches to your photo,</p>
                    <p>and you'll be notified once we are done.</p>
                    <p>Regards,<br><a href="https://photopia.info/">The Photo Blog App Team</a></p>
                </div>
            `,
        },
        done: {
            subject: `Photo Upload Successful | Photopia`,
            htmlContent: `
                <div class="header">
                    <h1 style="color: green">Photo Uploaded.</h1>
                </div>
                <div class="content">
                    <p>Hello ${firstName},</p>
                    <p>Your photo upload has been successful</p>
                    <p>You may go check it out now :)</p>
                    <p>Regards,<br><a href="https://photopia.info/">The Photo Blog App Team</a></p>
                </div>
            `,
        },
        fail: {
            subject: `Photo Upload Failed | Photopia`,
            htmlContent: `
                <div class="header">
                    <h1 style="color: red">Unable to Upload Photo.</h1>
                </div>
                <div class="content">
                    <p>Hello ${firstName},</p>
                    <p>We're sorry your photo upload couldn't go through :(</p>
                    <p>We will re-try and notify you, otherwise try again later.</p>
                    <p>Regards,<br><a href="https://photopia.info/">The Photo Blog App Team</a></p>
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
