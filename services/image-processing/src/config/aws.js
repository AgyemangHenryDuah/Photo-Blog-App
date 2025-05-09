const { S3Client } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { SESClient } = require('@aws-sdk/client-ses');
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');

// Configure clients with retry settings
const configureClient = (Client, options = {}) => {
  return new Client({
    region: process.env.AWS_REGION,
    maxAttempts: options.maxAttempts || 3,
    retryMode: options.retryMode || 'standard'
  });
};

// Export preconfigured clients
module.exports = {
  s3Client: configureClient(S3Client),
  dynamoClient: configureClient(DynamoDBClient),
  sesClient: configureClient(SESClient),
  cognitoClient: configureClient(CognitoIdentityProviderClient, {
    maxAttempts: 5
  })
};