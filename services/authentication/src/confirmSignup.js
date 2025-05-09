const { CognitoIdentityProviderClient, ConfirmSignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { createResponse, checkUserInDynamoDB } = require('./helpers/shared');
const { updateUserStatus } = require('./helpers/confirmSignup');

const cognitoClient = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
    try {
        const { email, confirmationCode } = JSON.parse(event.body);

        if (!email || !confirmationCode) {
            return createResponse(400, {
                message: 'Missing email or confirmation code.',
            });
        }

        /* Confirm the user in Cognito */
        const command = new ConfirmSignUpCommand({
            ClientId: process.env.CLIENT_ID,
            Username: email,
            ConfirmationCode: confirmationCode,
        });

        await cognitoClient.send(command);

        /* Find the user in DynamoDB by email */
        const user = await checkUserInDynamoDB(email);

        if (user) {
            /* Update the user's status to "verified" in DynamoDB */
            await updateUserStatus(user.userId, 'verified');
        } else {
            return createResponse(400, {
                error: 'User not found. Please ensure the email is correct.',
            });
        }

        return createResponse(200, {
            message: 'Account confirmed successfully!',
        });
    } catch (error) {
        console.error('Error confirming sign-up:', error);

        let errorMessage = error.message || 'An unexpected error occurred';
        let statusCode = 500;

        switch (error.name) {
            case 'CodeMismatchException':
                errorMessage = 'Invalid confirmation code. Please check and try again.';
                statusCode = 400;
                break;
            case 'ExpiredCodeException':
                errorMessage = 'Confirmation code has expired. Please request a new one.';
                statusCode = 400;
                break;
            case 'UserNotFoundException':
                errorMessage = 'User not found. Please ensure the email is correct.';
                statusCode = 404;
                break;
            case 'InvalidParameterException':
                errorMessage = 'Invalid input parameters.';
                statusCode = 400;
                break;
        }

        return createResponse(statusCode, {
            error: errorMessage,
            code: error.name || 'UNKNOWN_ERROR',
        });
    }
};
