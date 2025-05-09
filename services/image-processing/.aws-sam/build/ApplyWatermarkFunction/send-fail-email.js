exports.handler = async (event) => {
    try {
      const { userInfo, imageInfo } = JSON.parse(event.body);
  
      // Get user email from DynamoDB
      const userEmail = userInfo.email;
      const firstName = userInfo.firstname;
  
      //Get image metadata
      const imageId = imageInfo.imageId;
      const imageName = imageInfo.imageName;
  
      if (!userEmail) {
        throw new Error("User email not found for image: " + imageName);
      }
  
      // Send processing failed email
      await emailService.sendEmail(userEmail, "processing_failed", {
        firstName,
        imageName,
        failedAt: new Date().toISOString(),
      });
  
      return {
        statusCode: 200,
        message: JSON.stringify({ message: "Failed processing email sent" }),
        body: {
          Notification: true,
        },
      };
    } catch (error) {
      console.error("Error in processingFailed:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Error sending email" }),
        notification: false,
      };
    }
  };
  