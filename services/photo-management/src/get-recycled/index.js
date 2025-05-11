// Implement Lambda to get recycled photos
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const { createResponse, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const PHOTOS_TABLE = process.env.PHOTOS_TABLE;

exports.handler = async (event) => {
  try {
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      "1324d8c2-8091-7086-a944-773d576f9eea";

    if (!userId) {
      return createResponse(400, { message: "Missing userId in path parameters" });
    }

    const params = {
      TableName: PHOTOS_TABLE,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":true": true,
      },
      FilterExpression: "isDeleted = :true",
    };

    const command = new QueryCommand(params);
    const data = await docClient.send(command);

    return createResponse(200, { deletedPhotos: data.Items })

  } catch (error) {

    console.error("Error fetching deleted photos:", error);
    return handleError(error, "Failed to retrieve deleted photos" )
  }
};
