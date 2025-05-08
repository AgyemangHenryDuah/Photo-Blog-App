const { CognitoIdentityProviderClient, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const cognito = new CognitoIdentityProviderClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);

        // Initiate standard user authentication
        const authCommand = new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: process.env.CLIENT_ID,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
            },
        });

        const response = await cognito.send(authCommand);
        console.log("Response from cognito:", response);

        const idToken = response.AuthenticationResult.IdToken;

        // Fetch user data from DynamoDB
        const result = await ddbClient.send(
            new QueryCommand({
                TableName: process.env.USERS_TABLE,
                KeyConditionExpression: "email = :email",
                ExpressionAttributeValues: {
                    ":email": email,
                },
            }),
        );
        console.log("After querying user from db", result);
        const user = result.Items[0];

        return {
            statusCode: 200,
            headers: {
                ...getCorsHeaders(),
                "Set-Cookie": `token=${idToken}; Path=/; HttpOnly`,
            },
            body: JSON.stringify({
                success: true,
                user,
                token: idToken,
            }),
        };
    } catch (error) {
        console.error("Login error:", error);

        let statusCode = 400;
        let errorMessage = error.message;

        switch (error.name) {
            case "UserNotFoundException":
            case "NotAuthorizedException":
                statusCode = 401;
                errorMessage = "Invalid email or password";
                break;
        }

        return {
            statusCode,
            headers: getCorsHeaders(),
            body: JSON.stringify({
                error: errorMessage,
                code: error.name || "UNKNOWN_ERROR",
            }),
        };
    }
};

function getCorsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
        "Access-Control-Allow-Credentials": true,
        "Content-Type": "application/json",
    };
}
