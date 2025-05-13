const DynamoService = require('../sub-services/dynamodbService');

module.exports.handler = async (event) => {
    try {
        const { photoId } = event

        if (!photoId) {
            throw new Error("No photoId found in the event.");
        }
        const photoMetadata = await DynamoService.getImageMetadata(photoId);

        if (!photoMetadata) {
            throw new Error("No metadata found for photoId: ${photoId}");
        }

        const userDetails = await DynamoService.getUserDetails(photoMetadata.userId);

        if (!userDetails) {
            throw new Error("No user details found for userId: ${photoMetadata.userId}");
        }
        return {
            ...event,
            metadata: {
                ...photoMetadata,
                user: userDetails
            }
        }
    } catch (error) {
        console.error('Metadata extraction failed:', error);
        throw error;
    }
}