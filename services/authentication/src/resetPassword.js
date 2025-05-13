const {
    CognitoIdentityProviderClient,
    ConfirmForgotPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient();
const { createResponse } = require('./helpers/shared');

exports.handler = async (event) => {
    try {
        const { email, confirmationCode, newPassword } = JSON.parse(event.body);

        if (!email || !confirmationCode || !newPassword) {
            return createResponse(400, { message: 'email, confirmationCode, and newPassword are required' });
        }

        const confirmForgotPasswordParams = {
            ClientId: process.env.CLIENT_ID,
            Username: email,
            ConfirmationCode: confirmationCode,
            Password: newPassword,
        };

        const command = new ConfirmForgotPasswordCommand(confirmForgotPasswordParams);
        await cognitoClient.send(command);

        return createResponse(200, { message: 'Password has been reset successfully' });
    } catch (error) {
        console.error('Error confirming password reset:', error);

        let statusCode = 500;
        let errorMessage = error.message || 'An unexpected error occurred';

        switch (error.name) {
            case 'CodeMismatchException':
                statusCode = 400;
                errorMessage = 'Invalid verification code';
                break;
            case 'ExpiredCodeException':
                statusCode = 400;
                errorMessage = 'Verification code has expired';
                break;
            case 'InvalidPasswordException':
                statusCode = 400;
                errorMessage = 'The password you entered is invalid';
                break;
        }

        return createResponse(statusCode, {
            error: errorMessage,
            code: error.name || 'UNKNOWN_ERROR',
        });
    }
};
