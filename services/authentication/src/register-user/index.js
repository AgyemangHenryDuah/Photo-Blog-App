const { CognitoIdentityProviderClient, SignUpCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { PutCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new CognitoIdentityProviderClient({});
const _client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(_client);

// Hash password using PBKDF2
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return `${salt}:${hash}`;
}

exports.handler = async (event) => {
    try {
        const { firstName, lastName, email, password } = JSON.parse(event.body);

        const hash = hashPassword(password);

        const input = {
            ClientId: process.env.COGNITO_CLIENT_ID,
            Username: email,
            Password: password,
            UserAttributes: [
                { Name: "email", Value: email },
                { Name: "custom:firstName", Value: firstName },
                { Name: "custom:lastName", Value: lastName },
            ],
        };

        const command = new SignUpCommand(input);
        await client.send(command);

        // Use a UUID instead if no UserSub
        const userId = crypto.randomUUID();

        await docClient.send(
            new PutCommand({
                TableName: process.env.USERS_TABLE,
                Item: {
                    userId,
                    email,
                    firstName,
                    lastName,
                    password: hash,
                    createdAt: new Date().toISOString(),
                },
            }),
        );

        return {
            statusCode: 201,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
                "Access-Control-Allow-Credentials": true,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: "User created successfully",
            }),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "User creation failed" }),
        };
    }
};
