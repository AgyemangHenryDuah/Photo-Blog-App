// Get the uploaded image from S3

// Apply watermark

// Upload watermarked image to final bucket

// Update metadata

//Send success notification
// Import required AWS SDK v3 modules
import { SESClient, SendTemplatedEmailCommand } from "@aws-sdk/client-ses";

// Initialize SES client
const sesClient = new SESClient({ region: "us-east-1" });

// Function to send success email notification
async function sendSuccessEmail(recipientEmail, templateData) {
  const params = {
    Source: "sender@yourdomain.com",
    Destination: {
      ToAddresses: [recipientEmail]
    },
    Template: "WatermarkSuccessTemplate",
    TemplateData: JSON.stringify(templateData)
  };

  try {
    const command = new SendTemplatedEmailCommand(params);
    const response = await sesClient.send(command);
    console.log("Success email sent:", response.MessageId);
    return response;
  } catch (error) {
    console.error("Error sending success email:", error);
    throw error;
  }
}

// Example template data
const templateData = {
  fileName: "image.jpg",
  processedDate: new Date().toISOString(),
  downloadUrl: "https://XXXXXXXXXXXXXXXXXXXXXXXXXXXX/processed/image.jpg"
};

// Call the function
await sendSuccessEmail("recipient@example.com", templateData);