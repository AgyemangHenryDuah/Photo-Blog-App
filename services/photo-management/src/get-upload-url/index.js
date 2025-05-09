const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const { createResponse, parseBody, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

// Initialize clients
const s3Client = new S3Client({ region: process.env.PRIMARY_REGION });
const ddbClient = new DynamoDBClient({ region: process.env.PRIMARY_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

const PHOTOS_TABLE = process.env.PHOTOS_TABLE
const STAGING_BUCKET = process.env.STAGING_BUCKET;

const URL_EXPIRATION = 300; // 5 minutes

exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event));

    const requestBody = JSON.parse(event.body || '{}');
    const fileExtension = requestBody.fileType ? `.${requestBody.fileType.split('/')[1]}` : '.jpg';
    
    //const userId = event.requestContext.authorizer.claims.sub;
    const userId = '1324d8c2-8091-7086-a944-773d576f9eea';

    const photoId = uuidv4();
    
    const s3Key = `users/${userId}/${photoId}${fileExtension}`;
    
    const putObjectCommand = new PutObjectCommand({
      Bucket: STAGING_BUCKET,
      Key: s3Key,
      ContentType: requestBody.fileType || 'image/jpeg',
      Metadata: {
        'user-id': userId,
        'photo-id': photoId
      }
    });
    
    const presignedUrl = await getSignedUrl(s3Client, putObjectCommand, {
      expiresIn: URL_EXPIRATION
    });
    
    const timestamp = Date.now();
    
    const photoRecord = {
      photoId,
      userId,
      photoName: requestBody.fileName || `Image-${photoId}`,
      title: requestBody.title,
      description: requestBody.description || '',
      s3Key,
      uploadedAt: timestamp,
      status: 'pending',
      isDeleted: false,
      metadata: {
        originalFileName: requestBody.fileName,
        contentType: requestBody.fileType,
      }
    };
    
    await ddbDocClient.send(
      new PutCommand({
        TableName: PHOTOS_TABLE,
        Item: photoRecord
      })
    );

    const responseBody = {
      photoId,
      uploadUrl: presignedUrl,
      expiresIn: URL_EXPIRATION,
      key: s3Key
    }
    
    // Pre-signed URL and photo ID
    return createResponse(200, responseBody);

  } catch (error) {
    console.error('Error generating pre-signed URL:', error);
    
    // Error response
    return handleError('Error generating upload URL', error);

  }
};