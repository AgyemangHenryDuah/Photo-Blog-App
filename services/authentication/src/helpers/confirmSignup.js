const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

exports.updateUserStatus = async (userId, status) => {
    return docClient.send(
        new UpdateCommand({
            TableName: process.env.USERS_TABLE,
            Key: {
                userId,
            },
            UpdateExpression: 'set #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': status,
                ':updatedAt': new Date().toISOString(),
            },
            ReturnValues: 'UPDATED_NEW',
        }),
    );
};
