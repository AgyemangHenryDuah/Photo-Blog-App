const {
    CognitoIdentityProviderClient,
    SignUpCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    PutCommand,
    DynamoDBDocumentClient,
    QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const cognitoClient = new CognitoIdentityProviderClient({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
    try {
        const { firstName, lastName, email, password } = JSON.parse(event.body);

        if (!firstName || !lastName || !email || !password) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message:
                        'Missing required fields: username, firstName, lastName, password, and email',
                }),
            };
        }

        const checkUser = await docClient.send(
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

        if (checkUser.Items && checkUser.Items.length > 0) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({
                    error: 'User with this email already exists',
                }),
            };
        }

        if (!isPasswordValid(password)) {
            return {
                statusCode: 400,
                headers: getCorsHeaders(),
                body: JSON.stringify({
                    message: 'Password does not meet complexity requirements',
                }),
            };
        }

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
        const response = await cognitoClient.send(command);

        const userId = response.UserSub;

        await docClient.send(
            new PutCommand({
                TableName: process.env.USERS_TABLE,
                Item: {
                    userId,
                    email,
                    firstName,
                    lastName,
                    createdAt: new Date().toISOString(),
                },
            }),
        );

        return {
            statusCode: 201,
            headers: { ...getCorsHeaders() },
            body: JSON.stringify({
                message: 'User created successfully',
            }),
        };
    } catch (error) {
        console.error(error);
        if (error.name === 'UsernameExistsException') {
            return {
                statusCode: 409,
                headers: { ...getCorsHeaders() },
                body: JSON.stringify({
                    message: 'User with this email already exists',
                }),
            };
        }
        if (error.name === 'InvalidPasswordException') {
            return {
                statusCode: 400,
                headers: { ...getCorsHeaders() },
                body: JSON.stringify({
                    message: 'Password does not meet requirements',
                }),
            };
        }
    }
};

function getCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
        'Access-Control-Allow-Credentials': true,
        'Content-Type': 'application/json',
    };
}

const isPasswordValid = (password) => {
    // Password must be at least 8 characters long and include:
    // - At least one uppercase letter
    // - At least one lowercase letter
    // - At least one number
    // - At least one special character
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    return (
        password.length >= minLength &&
        hasUppercase &&
        hasLowercase &&
        hasNumber &&
        hasSpecialChar
    );
};
