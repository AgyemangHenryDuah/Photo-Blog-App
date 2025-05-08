const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
// const { createResponse, parseBody, handleError } = require('../../../../common/shared-utils');


exports.handler = async (event) => {

        const responseBody = {
            info: 'Success',
            message: 'Api Gateway - Routes working successfully...!'
        }


        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key',
                'Access-Control-Allow-Credentials': true,
                'Content-Type': 'application/json'
              },
            body: JSON.stringify(responseBody)

        }

}

