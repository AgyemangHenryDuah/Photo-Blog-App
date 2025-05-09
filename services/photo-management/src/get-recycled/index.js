// Implement Lambda to get recycled photos
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  try {
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      "1324d8c2-8091-7086-a944-773d576f9eea"; // REST API
    const tableName = process.env.PHOTOS_TABLE;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing userId in path parameters" }),
      };
    }

    const params = {
      TableName: tableName,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":true": true,
      },
      FilterExpression: "isDeleted = :true",
    };

    const command = new QueryCommand(params);
    const data = await docClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ deletedPhotos: data.Items }),
    };
  } catch (err) {
    console.error("Error fetching deleted photos:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to retrieve deleted photos" }),
    };
  }
};
