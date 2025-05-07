const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const fs = require('fs');
const path = require('path');

class EmailService {
    constructor() {
        this.sesClient = new SESClient({ region: process.env.AWS_REGION });
        this.templates = {
            processing_started: this.loadTemplate('started.html'),
            processing_success: this.loadTemplate('success.html'),
            processing_failed: this.loadTemplate('failed.html')
        };
    }

    loadTemplate(templateName) {
        return fs.readFileSync(path.join(__dirname, `../templates/${templateName}`), 'utf8');
    }

    async sendEmail(toAddress, templateName, templateData) {
        const template = this.templates[templateName];
        
        if (!template) {
            throw new Error(`Template ${templateName} not found`);
        }

        // Replace placeholders in template with actual data
        let emailBody = template;
        for (const [key, value] of Object.entries(templateData)) {
            emailBody = emailBody.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }

        const params = {
            Destination: {
                ToAddresses: [toAddress]
            },
            Message: {
                Body: {
                    Html: {
                        Charset: 'UTF-8',
                        Data: emailBody
                    }
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: this.getSubjectForTemplate(templateName)
                }
            },
            Source: process.env.SES_SENDER_EMAIL
        };

        try {
            const command = new SendEmailCommand(params);
            await this.sesClient.send(command);
            console.log(`Email sent successfully to ${toAddress}`);
            return true;
        } catch (error) {
            console.error(`Error sending email to ${toAddress}:`, error);
            throw error;
        }
    }

    getSubjectForTemplate(templateName) {
        const subjects = {
            processing_started: 'Your image processing has started',
            processing_success: 'Image processed successfully',
            processing_failed: 'Image processing failed'
        };
        return subjects[templateName] || 'Notification about your image processing';
    }
}

module.exports = new EmailService();