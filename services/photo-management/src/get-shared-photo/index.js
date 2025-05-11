const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { createResponse, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

// Initialize clients
const ddbClient = new DynamoDBClient({ region: process.env.PRIMARY_REGION || 'eu-central-1' });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});
const s3Client = new S3Client({ region: process.env.PRIMARY_REGION || 'eu-central-1' });

// Environment variables
const PHOTOS_TABLE = process.env.PHOTOS_TABLE;
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET;
const SHARE_LINKS_TABLE = process.env.SHARE_LINKS_TABLE;

// Constants
const PRESIGNED_URL_EXPIRATION = 300; // 5 minutes for viewing

exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event));

    const { shareToken } = event.pathParameters || {};
    
    if (!shareToken) {
      return createResponse(400, { message: 'Share token is required' });
    }

    const shareResponse = await ddbDocClient.send(
      new GetCommand({
        TableName: SHARE_LINKS_TABLE,
        Key: { shareToken }
      })
    );

    const shareRecord = shareResponse.Item;
    
    if (!shareRecord) {
      return createResponse(404, { message: 'Shared link not found or has expired' });
    }

    // Although DynamoDB TTL should handle this, it's not instantaneous)
    const now = Date.now();
    if (shareRecord.expiresAt < now) {
      return createResponse(410, { message: 'This shared link has expired' });
    }

    const photoResponse = await ddbDocClient.send(
      new GetCommand({
        TableName: PHOTOS_TABLE,
        Key: { 
            userId: shareRecord.userId, 
            photoId: shareRecord.photoId }
      })
    );

    const photo = photoResponse.Item;
    
    if (!photo) {
      return createResponse(404, { message: 'Photo not found' });
    }


    if (photo.isDeleted) {
      return createResponse(410, { message: 'This photo is no longer available' });
    }

    // Pre-signed URL
    const s3Key = photo.s3Key;
    const getObjectCommand = new GetObjectCommand({
      Bucket: PROCESSED_BUCKET,
      Key: s3Key
    });
    
    const presignedUrl = await getSignedUrl(s3Client, getObjectCommand, {
      expiresIn: PRESIGNED_URL_EXPIRATION
    });

    // Access count
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: SHARE_LINKS_TABLE,
        Key: { shareToken },
        UpdateExpression: 'SET accessCount = accessCount + :inc',
        ExpressionAttributeValues: {
          ':inc': 1
        }
      })
    );

    // Photo details and presigned URL
    return createResponse(200, {
      photoId: photo.photoId,
      title: photo.title,
      description: photo.description,
      imageUrl: presignedUrl,
      expiresIn: PRESIGNED_URL_EXPIRATION,
      shareExpiresAt: shareRecord.expiresAt,
      metadata: {
        contentType: photo.metadata?.contentType || 'image/jpeg',
        accessCount: shareRecord.accessCount + 1
      }
    });

  } catch (error) {
    console.error('Error retrieving shared photo:', error);
    return handleError( error, 'Error retrieving shared photo');
  }
};