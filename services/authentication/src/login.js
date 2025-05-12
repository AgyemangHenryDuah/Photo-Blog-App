const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { checkUserInDynamoDB, createResponse } = require('./helpers/shared');
const { sendEmail } = require('./helpers/sendEmail');

const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return createResponse(400, {
                message: 'Email and password are required',
            });
        }

        /* Initiate standard user authentication */
        const authCommand = new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: process.env.CLIENT_ID,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
            },
        });

        const response = await cognito.send(authCommand);
        const idToken = response.AuthenticationResult.IdToken;

        /* Fetch user data from DynamoDB */
        const user = await checkUserInDynamoDB(email);

        /* Send login email */
        await sendEmail(email, user.firstName, 'login');

        return createResponse(
            200,
            { success: true, user, token: idToken },
            { 'Set-Cookie': `token=${idToken}; Path=/; HttpOnly` },
        );
    } catch (error) {
        console.error('Login error:', error);

        let statusCode = 400;
        let errorMessage = error.message || 'An unexpected error occurred';

        switch (error.name) {
            case 'UserNotFoundException':
                statusCode = 404;
                errorMessage = 'User not found. Please ensure the email is correct.';
                break;
            case 'NotAuthorizedException':
                statusCode = 401;
                errorMessage = 'Invalid email or password';
                break;
        }
        return createResponse(statusCode, {
            error: errorMessage,
            code: error.name || 'UNKNOWN_ERROR',
        });
    }
};
