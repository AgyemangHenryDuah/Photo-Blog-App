import {
    CognitoIdentityProviderClient,
    ForgotPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient();

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
};

export const handler = async (event) => {
    try {
        const { email } = JSON.parse(event.body);

        if (!email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'Email is required' }),
            };
        }

        const forgotPasswordParams = {
            ClientId: process.env.CLIENT_ID,
            Username: email,
        };

        const command = new ForgotPasswordCommand(forgotPasswordParams);
        const response = await cognitoClient.send(command);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Password reset code sent successfully',
                deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
                destination: response.CodeDeliveryDetails?.Destination,
            }),
        };
    } catch (error) {
        console.error('Error initiating forgot password flow:', error);

        if (error.name === 'UserNotFoundException') userNotFoundRes();
        if (error.name === 'LimitExceededException') limitExceededRes();

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Error requesting password reset',
                error: error.message,
            }),
        };
    }
};

const userNotFoundRes = () => ({
    statusCode: 200,
    headers,
    body: JSON.stringify({
        message:
            'If a user with this email exists, a password reset code has been sent',
    }),
});

const limitExceededRes = () => ({
    statusCode: 429,
    headers,
    body: JSON.stringify({
        message: 'Too many requests, please try again later',
    }),
});
