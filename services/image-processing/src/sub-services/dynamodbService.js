const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamoClient } = require('../config/aws');

const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE;

class DynamoService {
    static async createImageMetadata(item) {
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        });
        return docClient.send(command);
    }

    static async getImageMetadata(imageId) {
        const command = new GetCommand({
            TableName: TABLE_NAME,
            Key: { imageId }
        });
        const result = await docClient.send(command)

        return result.Item;
    }

    static async updateImageMetadata(imageId, updateExpression, expressionAttributeValues) {
        const command = new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { imageId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        });
        return docClient.send(command);
    }

    static async deleteImageMetadata(imageId) {
        const command = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { imageId }
        });
        return docClient.send(command);
    }

    static async getUserDetails(userId) {
        const command = new AdminGetUserCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: userId
        })
        const response = await cognitoClient.send(command);
        const emailAttr = response.UserAttributes.find(attr => attr.Name === 'email');
        const usernameAttr = response.UserAttributes.find(attr => attr.Name === 'preferred_username');
        const lastNameAttr = response.UserAttributes.find(attr => attr.Name === 'family_name');
        return { email: emailAttr.Value, firstname: usernameAttr.Value, lastname: lastNameAttr.Value };
    }
}

module.exports = DynamoService;