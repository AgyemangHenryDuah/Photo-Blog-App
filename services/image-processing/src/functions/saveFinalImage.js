const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const fs = require("fs").promises;
const path = require("path");

// Update metadata with the URL




// Notify user of completion

// Function to send completion notification email
async function sendCompletionEmail(subscriberEmail) {
  try {
    // Read email template
    const templatePath = path.join(__dirname, "templates", "success.html");
    const template = await fs.readFile(templatePath, "utf8");

    // Configure AWS SES
    const sesClient = new SESClient({
      region: process.env.AWS_REGION,
    });

    // Configure email parameters for SES
    const params = {
      Destination: {
        ToAddresses: [subscriberEmail],
      },
      Message: {
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: template,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: "Task Completed Successfully",
        },
      },
      Source: process.env.FROM_EMAIL,
    };

    // Send email using SES
    const command = new SendEmailCommand(params);
    await sesClient.send(command);
    console.log("Completion notification email sent successfully");
  } catch (error) {
    console.error("Error sending completion email:", error);
    throw error;
  }
}
