const { SESClient, CreateTemplateCommand } = require('@aws-sdk/client-ses');

// Initialize SES client
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Template name
const TEMPLATE_NAME = 'ImageProcessingTemplate';

// Template content based on the email template we created earlier
const emailTemplateHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{heading}}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            text-align: center;
            padding: 20px 0;
            border-bottom: 1px solid #eeeeee;
        }
        .logo {
            max-height: 60px;
            margin-bottom: 15px;
        }
        .content {
            padding: 20px 0;
        }
        .footer {
            font-size: 12px;
            color: #777777;
            text-align: center;
            border-top: 1px solid #eeeeee;
            padding-top: 20px;
            margin-top: 20px;
        }
        .button {
            display: inline-block;
            background-color: #1e90ff;
            color: white;
            padding: 12px 20px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 15px 0;
        }
        .support {
            background-color: #f8f9fa;
            padding: 12px;
            border-radius: 4px;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="{{logo_url}}" alt="Company Logo" class="logo">
        <h1>{{heading}}</h1>
    </div>
    
    <div class="content">
        <p>Hello {{recipient_name}},</p>
        
        <p>{{message}}</p>
        
        {{#if is_success}}
        <p>You can view your watermarked image here:</p>
        <div style="text-align: center;">
            <a href="{{result_url}}" class="button">View Result</a>
        </div>
        {{/if}}
        
        {{#if is_failure}}
        <div class="support">
            <p>Don't worry, our system will automatically retry the process. If you continue to experience issues, please contact our support team:</p>
            <p>Email: <a href="mailto:{{support_email}}">{{support_email}}</a><br>
            Phone: {{support_phone}}</p>
        </div>
        {{/if}}
        
        <p>Thank you for using our services!</p>
        
        <p>Best regards,<br>
        The {{company_name}} Team</p>
    </div>
    
    <div class="footer">
        <p>© {{current_year}} {{company_name}}. All rights reserved.</p>
        <p>
            <a href="{{unsubscribe_url}}">Unsubscribe</a> | 
            <a href="{{privacy_policy_url}}">Privacy Policy</a> | 
            <a href="{{terms_url}}">Terms of Service</a>
        </p>
    </div>
</body>
</html>`;

/**
 * Function to create the email template in Amazon SES
 */
async function createSESTemplate() {
    const params = {
        Template: {
            TemplateName: TEMPLATE_NAME,
            SubjectPart: '{{heading}}',
            HtmlPart: emailTemplateHTML,
            TextPart: 'Hello {{recipient_name}}, {{message}} {{#if is_success}}You can view your watermarked image here: {{result_url}}{{/if}} {{#if is_failure}}Don\'t worry, our system will automatically retry the process. If you continue to experience issues, please contact our support team: Email: {{support_email}}, Phone: {{support_phone}}{{/if}} Thank you for using our services! Best regards, The {{company_name}} Team'
        }
    };

    try {
        const command = new CreateTemplateCommand(params);
        const response = await sesClient.send(command);
        console.log('SES template created successfully:', response);
        return response;
    } catch (error) {
        // If the template already exists, this will fail
        if (error.name === 'AlreadyExistsException') {
            console.log('Template already exists. Please use UpdateTemplateCommand to modify it.');
        } else {
            console.error('Error creating SES template:', error);
            throw error;
        }
    }
}

// Execute the function if this script is run directly
if (require.main === module) {
    createSESTemplate()
        .then(() => console.log('Template creation process completed'))
        .catch(err => console.error('Template creation failed:', err));
}

// Export for use in other scripts
module.exports = { createSESTemplate };