const { CognitoIdentityProviderClient, ForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient();
const { createResponse } = require('./helpers/shared');

exports.handler = async (event) => {
    try {
        const { email } = JSON.parse(event.body);

        if (!email) return createResponse(400, { message: 'Email is required' });

        const forgotPasswordParams = {
            ClientId: process.env.CLIENT_ID,
            Username: email,
        };

        const command = new ForgotPasswordCommand(forgotPasswordParams);
        const response = await cognitoClient.send(command);

        return createResponse(200, {
            message: 'Password reset code sent successfully',
            deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
            destination: response.CodeDeliveryDetails?.Destination,
        });
    } catch (error) {
        console.error('Error initiating forgot password flow:', error);

        let statusCode = 500;
        let errorMessage = error.message || 'Error requesting password reset';

        switch (error.name) {
            case 'UserNotFoundException':
                statusCode = 500;
                errorMessage = 'If a user with this email exists, a password reset code has been sent';
                break;
            case 'LimitExceededException':
                statusCode = 429;
                errorMessage = 'Too many requests, please try again later';
                break;
        }

        return createResponse(statusCode, {
            error: errorMessage,
            code: error.name || 'UNKNOWN_ERROR',
        });
    }
};
