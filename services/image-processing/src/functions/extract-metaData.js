const DynamoService = require('../sub-services/dynamodbService');

module.exports.handler = async (event) => {
    try {
        const records = event.Records;

        if (records.length === 0) {
            throw new Error("No records found in the event.");
        }
        const sqsMessage = JSON.parse(records[0].body);
        const imageId = sqsMessage.imageId;

        const metatdata = await DynamoService.getImageMetadata(imageId);
        const userDetails = await DynamoService.getUserDetails(response.Item.userId);

        if (!userDetails) {
            throw new Error(`User details not found for userId: ${response.Item.userId}`);
        }

        if (!response) {
            throw new Error(`No metadata found for imageId: ${imageId}`);
        }
        return {
            statusCode: 200,
            body: {
                imageInfo: {
                    imageId: metatdata.imageId,
                    imageName: metatdata.imageName,
                    s3key: metatdata.s3Key,
                },
                userInfo: {
                    userId: metatdata.userId,
                    email: userDetails.email,
                    firstName: userDetails.firstName,
                    lastName: userDetails.lastName
                },
                uploadedAt: metatdata.uploadedAt,
            }
        }
    } catch (error) {
        console.error("Error in extractMetaData:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" })
        };
    }
}