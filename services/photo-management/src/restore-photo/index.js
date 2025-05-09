const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  try {
    const { imageId } = JSON.parse(event.body || "{}");
    const tableName = process.env.PHOTOS_TABLE_NAME;
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      "1324d8c2-8091-7086-a944-773d576f9eea"; // REST API

    if (!imageId || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing imageId or userId" }),
      };
    }

    const command = new UpdateCommand({
      TableName: tableName,
      Key: {
        imageId,
        userId,
      },
      UpdateExpression: "SET isDeleted = :false REMOVE deletedAt",
      ExpressionAttributeValues: {
        ":false": false,
      },
      ConditionExpression:
        "attribute_exists(imageId) AND attribute_exists(userId)",
    });

    await docClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Photo restored successfully." }),
    };
  } catch (err) {
    console.error("Error restoring photo:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to restore photo." }),
    };
  }
};
