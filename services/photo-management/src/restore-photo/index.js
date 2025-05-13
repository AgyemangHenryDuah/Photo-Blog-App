const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const { createResponse, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const PHOTOS_TABLE = process.env.PHOTOS_TABLE;

exports.handler = async (event) => {

  try {

    console.log('Event:', JSON.stringify(event));

    const { photoId } = event.pathParameters || {};

    const userId = event.requestContext.authorizer.claims.sub || '1324d8c2-8091-7086-a944-773d576f9eea';

    if (!photoId || !userId) {
      return createResponse(400, { message: "Missing photoId or userId" });
    }

    const command = new UpdateCommand({
      TableName: PHOTOS_TABLE,
      Key: {
        photoId,
        userId,
      },
      UpdateExpression: "SET isDeleted = :false REMOVE deletedAt",
      ExpressionAttributeValues: {
        ":false": false,
      },
      ConditionExpression:
        "attribute_exists(photoId) AND attribute_exists(userId)",
    });

    await docClient.send(command);

    return createResponse(200, { message: "Photo restored successfully." });

  } catch (error) {
    console.error("Error restoring photo:", error);
    return handleError(error, "Failed to restore photo.");
  }
};
