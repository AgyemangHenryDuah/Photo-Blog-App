const { checkUserInCognito, resendConfirmationCode, createCognitoUser, createDynamoUser } = require('./helpers/signup');

const { checkUserInDynamoDB, createResponse } = require('./helpers/shared');

exports.handler = async (event) => {
    try {
        const { firstName, lastName, email, password } = JSON.parse(event.body);

        if (!firstName || !lastName || !email || !password) {
            return createResponse(400, {
                message: 'Missing required fields: firstName, lastName, email, and password',
            });
        }

        /* Check if user exists in both Cognito and DynamoDB */
        const { userExistsInCognito, isConfirmed } = await checkUserInCognito(email);
        const existingUser = await checkUserInDynamoDB(email);

        /* Handle existing user scenarios */
        if (userExistsInCognito || existingUser) {
            /* Case 1: User exists but is not confirmed - resend confirmation code */
            if (userExistsInCognito && !isConfirmed) {
                await resendConfirmationCode(email);

                return createResponse(200, {
                    message: 'Confirmation code resent. Please check your email.',
                });
            }

            /* Case 2: User exists and is confirmed - return error */
            return createResponse(400, {
                error: 'User with this email already exists',
            });
        }

        /* Create new user in Cognito */
        const cognitoResponse = await createCognitoUser(email, password, firstName, lastName);

        /* Create user in DynamoDB */
        const userId = cognitoResponse.UserSub;
        await createDynamoUser(userId, email, firstName, lastName);

        return createResponse(201, {
            message: 'User created successfully. Please check your email for confirmation code.',
        });
    } catch (error) {
        console.error('Signup error:', error);
        let statusCode = 500;
        let errorMessage = error.message || 'An unexpected error occurred';

        if (error.name === 'InvalidPasswordException') {
            statusCode = 400;
            errorMessage = 'Password does not meet requirements';
        }
        return createResponse(statusCode, {
            error: errorMessage,
            code: error.name || 'UNKNOWN_ERROR',
        });
    }
};
