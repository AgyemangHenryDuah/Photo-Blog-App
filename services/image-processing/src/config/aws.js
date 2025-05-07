const { S3Client } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { SESClient } = require('@aws-sdk/client-ses');
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');

module.exports = {
    s3Client: new S3Client({ region: process.env.AWS_REGION }),
    dynamoClient: new DynamoDBClient({ region: process.env.AWS_REGION }),
    sesClient: new SESClient({ region: process.env.AWS_REGION }),
};