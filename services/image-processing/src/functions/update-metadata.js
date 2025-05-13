const { stat } = require('fs');
const DynamoService = require('../sub-services/dynamodbService');

module.exports.handler = async (event) => {
    try {
        const { photoId, status, processedAt, processedLocation } = event;

        if (!photoId) {
            throw new Error('photoId is required');
        }

        const updateExpression = [];
        const ExpressionAttributeValues = {};

        if (status) {
            updateExpression.push('status = :status');
            ExpressionAttributeValues[':status'] = status;
        }

        if (processedAt) {
            updateExpression.push('processedAt = :processedAt');
            ExpressionAttributeValues[':processedAt'] = processedAt;
        }

        if (updateExpression.length === 0) {
            throw new Error('No valid fields to update');
        }

        const updatedItem = await DynamoService.updateImageMetadata(
            photoId,
            updateExpression.join(', '),
            ExpressionAttributeValues
        );

        return {
            photoId: updatedItem.photoId,
            status: updatedItem.status,
            processedAt: updatedItem.processedAt
        }
    }
    catch (error) {
        console.error("Error in updating image metadata:", error);
        throw error;
    }
}