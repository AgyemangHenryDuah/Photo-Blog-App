const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { createResponse, parseBody, handleError } = require('../../../../common/shared-utils');


exports.handler = async (event) => {

    try {

        console.log('This works!', parseBody);

        console.log('Exploring API Event object: ' , event);

        const responseBody = {
            info: 'Success',
            message: 'Api Gateway - Routes working successfully...!'
        }

        return createResponse(200, responseBody);

    } catch (error) {
        return handleError(error)
    }
}

