const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const getCorsHeaders = () => {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
        'Access-Control-Allow-Credentials': true,
        'Content-Type': 'application/json',
    };
};

exports.checkUserInDynamoDB = async (email) => {
    const result = await docClient.send(
        new QueryCommand({
            TableName: process.env.USERS_TABLE,
            IndexName: 'EmailIndex',
            KeyConditionExpression: '#email = :email',
            ExpressionAttributeNames: {
                '#email': 'email',
            },
            ExpressionAttributeValues: {
                ':email': email,
            },
        }),
    );

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
};

exports.createResponse = (statusCode, body, optionalHeaders = {}) => {
    return {
        statusCode,
        headers: { ...optionalHeaders, ...getCorsHeaders() },
        body: JSON.stringify(body),
    };
};

exports.isPasswordValid = (password) => {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    return password.length >= minLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
};
