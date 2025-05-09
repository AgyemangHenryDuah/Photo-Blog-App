const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamoClient } = require('../config/aws');

const docClient = DynamoDBDocumentClient.from(dynamoClient);
const PHOTOS_TABLE = process.env.PHOTOS_TABLE;

class DynamoService {
    static async getImageMetadata(imageId) {
        const command = {
            TableName: PHOTOS_TABLE,
            Key: { imageId: imageId },
            ProjectionExpression: "imageId, imageName, imageSize, imageType, imageUrl, createdAt"
        };
        const result = await docClient.send(command)

        return result.Item;
    }

    static async updateImageMetadata(imageId, updateExpression, ExpressionAttributeValues) {
        const command = {
            TableName: PHOTOS_TABLE,
            Key: { imageId: imageId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeValues: ExpressionAttributeValues,
            ReturnValues: "ALL_NEW"
        };

        return await this.docClient.send(new UpdateCommand(command));
    }


    static async getUserDetails(userId) {
        const command = {
            TABLE_NAME: process.env.USER_TABLE,
            Key: { userId: userId },
            ProjectionExpression: "userId, email, firstname, lastname"
        }
        const result = await docClient.send(command)
        return result.Item
    }
}

module.exports = DynamoService;