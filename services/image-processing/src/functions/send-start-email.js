exports.handler = async (event) => {
    try {
      const { userInfo, imageInfo } = JSON.parse(event.body);
  
      // Get user email from DynamoDB
      const userEmail = userInfo.email;
      const firstName = userInfo.firstname;
      const lastName = userInfo.lastname;
  
      //Get image metadata
      const imageId = imageInfo.imageId;
      const imageName = imageInfo.imageName;
  
      if (!userEmail) {
        throw new Error("User email not found for image: " + imageName);
      }
  
      // Send processing failed email
      await emailService.sendEmail(userEmail, "processing_started", {
        firstName,
        imageName,
        startTime: new Date().toISOString(),
      });
  
      return {
        statusCode: 200,
        message: JSON.stringify({ message: "Successfully processed email sent" }),
        body: {
          firstName,
          lastName,
          imageName,
          s3key: imageInfo.s3key,
          imageId,
          userEmail,
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
  