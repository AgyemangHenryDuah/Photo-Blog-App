const { userInfo } = require('os');
const DynamoService = require('../sub-services/dynamodbService');

module.exports.handler = async (event) => {
    try {
        const inputData = JSON.parse(event.body);

        if (!inputData.imageId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'imageId is required' })
            };
        }

        const updateExpression = [];
        const ExpressionAttributeValues = {};

        if (inputData.status) {
            updateExpression.push('status = :status');
            ExpressionAttributeValues[':status'] = inputData.status;
        }

        if (inputData.processingDate) {
            updateExpression.push('processedAt = :processedAt');
            ExpressionAttributeValues[':processedAt'] = inputData.processedAt;
        }

        // Add processed location (s3Key) to update if provided
        if (inputData.processedLocation) {
            updateExpression.push('s3Key = :s3Key');
            ExpressionAttributeValues[':s3Key'] = inputData.processedLocation.s3Key;
        }

        // Check if there are any fields to update
        if (updateExpression.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'No valid fields to update' })
            };
        }

        // Call the service method to update the metadata
        const updatedItem = await DynamoService.updateImageMetadata(
            inputData.imageId,
            updateExpression,
            ExpressionAttributeValues
        );

        // Return success response
        return {
            statusCode: 200,
            body: {
                imageInfo: {
                    s3Key: updatedItem.processedLocation.s3Key,
                    imageId: updatedItem.imageId,

                }

            }

        }
    }
    catch (error) {
        console.error("Error in updating image metadata:", error);

        // Return error response
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to update image metadata',
                error: error.message
            })
        };
    }
}