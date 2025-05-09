const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize clients
const s3Client = new S3Client({ region: process.env.PRIMARY_REGION });
const ddbClient = new DynamoDBClient({ region: process.env.PRIMARY_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);


const PHOTOS_TABLE = process.env.PHOTOS_TABLE
const STAGING_BUCKET = process.env.STAGING_BUCKET;

// URL expiration
const URL_EXPIRATION = 300; // 5 minutes

//Generating pre-signed URL
exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event));

    const requestBody = JSON.parse(event.body || '{}');
    const fileExtension = requestBody.fileType ? `.${requestBody.fileType.split('/')[1]}` : '.jpg';
    
    // user ID 
    const userId = event.requestContext.authorizer.claims.sub;

    // Generating image ID
    const imageId = uuidv4();
    
    // S3 key with user ID path
    const s3Key = `users/${userId}/${imageId}${fileExtension}`;
    
    // Create command for pre-signed URL
    const putObjectCommand = new PutObjectCommand({
      Bucket: STAGING_BUCKET,
      Key: s3Key,
      ContentType: requestBody.fileType || 'image/jpeg',
      Metadata: {
        'user-id': userId,
        'image-id': imageId
      }
    });
    
    // Generate pre-signed URL
    const presignedUrl = await getSignedUrl(s3Client, putObjectCommand, {
      expiresIn: URL_EXPIRATION
    });
    
    const timestamp = Date.now();
    
    // Create pending record
    const imageRecord = {
      imageId,
      userId,
      imageName: requestBody.fileName || `Image-${imageId}`,
      title: requestBody.title,
      description: requestBody.description || '',
      s3Key,
      uploadedAt: timestamp,
      status: 'pending',
      isDeleted: false,
      metadata: {
        originalFileName: requestBody.fileName,
        contentType: requestBody.fileType,
        // userFirstName,
        // userLastName
      }
    };
    
    // Save record
    await ddbDocClient.send(
      new PutCommand({
        TableName: PHOTOS_TABLE,
        Item: imageRecord
      })
    );
    
    // Return pre-signed URL and image ID
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
      },
      body: JSON.stringify({
        imageId,
        uploadUrl: presignedUrl,
        expiresIn: URL_EXPIRATION,
        key: s3Key
      })
    };
  } catch (error) {
    console.error('Error generating pre-signed URL:', error);
    
    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
      },
      body: JSON.stringify({
        message: 'Error generating upload URL',
        error: error.message
      })
    };
  }
};