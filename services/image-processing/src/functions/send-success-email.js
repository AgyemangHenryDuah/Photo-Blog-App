exports.handler = async (event) => {
  try {
    const { userInfo, imageInfo } = JSON.parse(event.body);

    // Get user email from DynamoDB
    const userEmail = userInfo.email;
    const firstName = userInfo.firstname;

    //Get image metadata
    const imageId = imageInfo.imageId;
    const imageName = imageInfo.imageName;
    const imageUrl  = imageInfo.imageUrl;

    if (!userEmail) {
      throw new Error("User email not found for image: " + imageName);
    }

    // Send processing failed email
    await emailService.sendEmail(userEmail, "processing_success", {
      firstName,
      imageName,
      completedAt: new Date().toISOString(),
      downloadUrl: imageUrl
    });

    return {
      statusCode: 200,
      message: JSON.stringify({ message: "Successfully processed email sent" }),
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
