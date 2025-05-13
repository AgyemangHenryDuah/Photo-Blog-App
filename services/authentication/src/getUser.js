const { createResponse, checkUserInDynamoDB } = require('./helpers/shared');

exports.handler = async (event) => {
    try {
        const email = event.requestContext?.authorizer?.claims?.email;

        const user = await checkUserInDynamoDB(email);
        return createResponse(200, { user });
    } catch (err) {
        console.error('Error getting user', err);
        return createResponse(500, { error: 'Failed to fetch user' });
    }
};
