const {
    CognitoIdentityProviderClient,
    SignUpCommand,
    ResendConfirmationCodeCommand,
    AdminGetUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { PutCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoDBClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

exports.checkUserInCognito = async (email) => {
    try {
        const adminGetUserCommand = new AdminGetUserCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: email,
        });

        const userResponse = await cognitoClient.send(adminGetUserCommand);
        const isConfirmed = userResponse.UserStatus === 'CONFIRMED';

        return { userExistsInCognito: true, isConfirmed };
    } catch (error) {
        if (error.name !== 'UserNotFoundException') {
            throw error;
        }
        return { userExistsInCognito: false, isConfirmed: false };
    }
};

exports.resendConfirmationCode = async (email) => {
    const resendCommand = new ResendConfirmationCodeCommand({
        ClientId: process.env.CLIENT_ID,
        Username: email,
    });

    return cognitoClient.send(resendCommand);
};

exports.createCognitoUser = async (email, password, firstName, lastName) => {
    const input = {
        ClientId: process.env.CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'custom:firstName', Value: firstName },
            { Name: 'custom:lastName', Value: lastName },
        ],
    };

    const command = new SignUpCommand(input);
    return cognitoClient.send(command);
};

exports.createDynamoUser = (userId, email, firstName, lastName) => {
    return docClient.send(
        new PutCommand({
            TableName: process.env.USERS_TABLE,
            Item: {
                userId,
                email,
                firstName,
                lastName,
                status: 'unverified',
                createdAt: new Date().toISOString(),
            },
        }),
    );
};
