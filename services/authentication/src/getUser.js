// Implement Lambda for getting user info accordingly :)

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    ScanCommand,
    DynamoDBDocumentClient,
} = require('@aws-sdk/lib-dynamodb');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Initialize JWKS client
const jwks = jwksClient({
    jwksUri: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}/.well-known/jwks.json`,
});

// Get public key for JWT verification
function getKey(header, callback) {
    jwks.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

// Extract idToken from Cookie header
function extractTokenFromCookies(cookieHeader) {
    const cookies = cookieHeader?.split(';').map((c) => c.trim()) || [];
    const tokenCookie = cookies.find((c) => c.startsWith('token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
}

exports.handler = async (event) => {
    try {
        const token = extractTokenFromCookies(event.headers?.Cookie);

        if (!token) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }

        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(token, getKey, {}, (err, decoded) => {
                if (err) reject(err);
                else resolve(decoded);
            });
        });

        const email = decoded.email;

        // Query DynamoDB using email
        const result = await docClient.send(
            new ScanCommand({
                TableName: process.env.USERS_TABLE,
                FilterExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': email,
                },
            }),
        );

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user: result.Items[0] }),
        };
    } catch (err) {
        console.error('Error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch user' }),
        };
    }
};
