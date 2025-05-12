const { createResponse, checkUserInDynamoDB } = require('./helpers/shared');
// const { getKey, extractTokenFromCookies } = require('./helpers/getUser');

// const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    try {
        // const token = extractTokenFromCookies(event.headers?.Cookie);

        // if (!token) return createResponse(401, { error: 'Unauthorized' });

        // const decoded = await new Promise((resolve, reject) => {
        //     jwt.verify(token, getKey, {}, (err, decoded) => {
        //         if (err) reject(err);
        //         else resolve(decoded);
        //     });
        // });

        const email = event.requestContext?.authorizer?.claims?.email;

        // Query DynamoDB using email
        const user = await checkUserInDynamoDB(email);
        return createResponse(200, { user });
    } catch (err) {
        console.error('Error getting user', err);
        return createResponse(500, { error: 'Failed to fetch user' });
    }
};
