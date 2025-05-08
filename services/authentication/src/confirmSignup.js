const {
    CognitoIdentityProviderClient,
    ConfirmSignUpCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
    try {
        const { email, confirmationCode } = JSON.parse(event.body);

        if (!email || !confirmationCode) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Missing username or confirmation code.',
                }),
            };
        }

        const command = new ConfirmSignUpCommand({
            ClientId: process.env.CLIENT_ID,
            Username: email,
            ConfirmationCode: confirmationCode,
        });

        await cognitoClient.send(command);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Account confirmed successfully!',
            }),
        };
    } catch (error) {
        console.error('Error confirming sign-up:', error);

        let errorMessage = 'Failed to confirm account. Please try again.';
        let statusCode = 500;

        if (error.Code === 'CodeMismatchException') {
            errorMessage =
                'Invalid confirmation code. Please check and try again.';
            statusCode = 400;
        } else if (error.Code === 'ExpiredCodeException') {
            errorMessage =
                'Confirmation code has expired. Please request a new one.';
            statusCode = 400;
        } else if (error.Code === 'UserNotFoundException') {
            errorMessage =
                'User not found. Please ensure the username is correct.';
            statusCode = 400;
        } else if (error.Code === 'InvalidParameterException') {
            errorMessage = 'Invalid input parameters.';
            statusCode = 400;
        }

        return {
            statusCode: statusCode,
            body: JSON.stringify({ error: errorMessage }),
        };
    }
};
