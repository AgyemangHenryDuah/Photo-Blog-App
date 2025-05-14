const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const { createResponse, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

// Initialize clients
const ssmClient = new SSMClient({ region: process.env.PRIMARY_REGION });
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

const response = await ssmClient.send(new GetParameterCommand({ Name: '/photo-blog-app/dev/api-endpoint', WithDecryption: true }));
const API_BASE_URL = response.Parameter.Value;

// Constants
const SHARE_EXPIRATION_HOURS = 3;
const MS_PER_HOUR = 3600000;

exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event));

    const { photoId } = event.pathParameters || {};
    
    if (!photoId) {
      return createResponse(400, { message: 'Photo ID is required' });
    }

    const userId = event.requestContext.authorizer.claims.sub || '1324d8c2-8091-7086-a944-773d576f9eea';

    // Checking if the photo exists and belongs to the user
    const photoResponse = await ddbDocClient.send(
      new GetCommand({
        TableName: PHOTOS_TABLE,
        Key: { userId, photoId }
      })
    );

    const photo = photoResponse.Item;
    
    if (!photo) {
      return createResponse(404, { message: 'Photo not found' });
    }

    if (photo.status !== 'processed' ) {
        return createResponse(202, { message: 'This photo is not ready to be viewed' });
    }

    if (photo.userId !== userId) {
      return createResponse(403, { message: 'You do not have permission to share this photo' });
    }

    if (photo.isDeleted) {
      return createResponse(400, { message: 'Cannot share a deleted photo' });
    }

    const shareToken = uuidv4();
    
    //Expiry (3 hours from now)
    const now = Date.now();
    const expiresAt = now + (SHARE_EXPIRATION_HOURS * MS_PER_HOUR);
    
    const shareRecord = {
      shareToken,
      photoId,
      userId,
      createdAt: now,
      expiresAt, // TTL attribute for auto-deletion after expiration
      accessCount: 0
    };
    
    await ddbDocClient.send(
      new PutCommand({
        TableName: SHARE_LINKS_TABLE,
        Item: shareRecord
      })
    );

    // Shareable URL using the API Gateway endpoint
    const shareUrl = `${API_BASE_URL}/shared/${shareToken}`;
    
    return createResponse(200, {
      shareToken,
      shareUrl,
      expiresAt,
      expiresIn: `${SHARE_EXPIRATION_HOURS} hours`
    });

  } catch (error) {
    console.error('Error generating share link:', error);
    return handleError( error, 'Error generating share link');
  }
};