const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand
} = require("@aws-sdk/lib-dynamodb");
const {
  S3Client,
  DeleteObjectsCommand
} = require("@aws-sdk/client-s3");

const { createResponse, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const PHOTOS_TABLE = process.env.PHOTOS_TABLE;
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET;

exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event));

    const userId = event.requestContext.authorizer.claims.sub || '1324d8c2-8091-7086-a944-773d576f9eea';
    
    if (!userId) {
      return createResponse(400, { message: "Missing userId" });
    }

    // Get all photos marked as deleted for this user
    const queryCommand = new QueryCommand({
      TableName: PHOTOS_TABLE,
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "isDeleted = :isDeleted",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":isDeleted": true
      }
    });

    const queryResult = await docClient.send(queryCommand);
    const deletedPhotos = queryResult.Items;

    if (!deletedPhotos || deletedPhotos.length === 0) {
      return createResponse(200, { message: "No photos found in recycle bin." });
    }

    console.log(`Found ${deletedPhotos.length} photos in recycle bin for user ${userId}`);

    // Delete from S3 bucket
    const objectsToDelete = deletedPhotos.map(photo => {
      return { Key: photo.s3Key };
    });

    // Delete in batches of 1000 (S3 limit)
    for (let i = 0; i < objectsToDelete.length; i += 1000) {
      const batch = objectsToDelete.slice(i, i + 1000);
      
      const deleteS3Command = new DeleteObjectsCommand({
        Bucket: PROCESSED_BUCKET,
        Delete: {
          Objects: batch
        }
      });
      
      await s3Client.send(deleteS3Command);
    }

    // Delete from DynamoDB (in batches of 25 - DynamoDB limit)
    for (let i = 0; i < deletedPhotos.length; i += 25) {
      const batch = deletedPhotos.slice(i, i + 25);
      
      const deleteItems = batch.map(photo => ({
        DeleteRequest: {
          Key: {
            photoId: photo.photoId,
            userId: userId
          }
        }
      }));
      
      const batchWriteCommand = new BatchWriteCommand({
        RequestItems: {
          [PHOTOS_TABLE]: deleteItems
        }
      });
      
      await docClient.send(batchWriteCommand);
    }

    return createResponse(200, { 
      message: `Successfully emptied recycle bin. Deleted ${deletedPhotos.length} photos permanently.`,
      deletedCount: deletedPhotos.length
    });

  } catch (error) {
    console.error("Error emptying recycle bin:", error);
    return handleError(error, "Failed to empty recycle bin.")
  }
};