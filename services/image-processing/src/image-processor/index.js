const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const stream = require('stream');
const { createResponse, parseBody, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// Register a custom font
registerFont(path.join(__dirname, 'fonts/Roboto-Regular.ttf'), { family: 'Roboto' });

// Initialize clients
const s3 = new S3Client();
const dynamoClient = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new SSMClient({ region: process.env.PRIMARY_REGION });

exports.handler = async (event) => {
  console.log('Architecture:', process.arch);
  console.log('Processing SQS event:', JSON.stringify(event, null, 2));

  const response = await ssmClient.send(new GetParameterCommand({ Name: `/photo-blog-app/${process.env.ENVIRONMENT_NAME}/users-table`, WithDecryption: true })); // change [dev] to [prod] in production
  
  const usersTable = response.Parameter.Value;
  const stagingBucket = process.env.STAGING_BUCKET;
  const processedBucket = process.env.PROCESSED_BUCKET;
  const photosTable = process.env.PHOTOS_TABLE;
  
  if (!stagingBucket || !processedBucket || !photosTable) {
    throw new Error('Missing required environment variables');
  }
  
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      const { bucket, key } = messageBody;

      const keyParts = key.split('/');
      if (keyParts.length !== 3 || keyParts[0] !== 'users') {
        throw new Error(`Invalid key format: ${key}. Expected format: users/userId/photoId.ext`);
      }

      const userId = keyParts[1];
      const fileNameWithExt = keyParts[2];
      const photoId = fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.'));
      const fileExt = fileNameWithExt.substring(fileNameWithExt.lastIndexOf('.') + 1).toLowerCase();

      // Getting photo data
      const getItemParams = {
        TableName: photosTable,
        Key: {
          userId,
          photoId
        }
      };

      const { Item: photoData } = await docClient.send(new GetCommand(getItemParams));
      if (!photoData) {
        throw new Error(`Photo record not found for userId: ${userId}, photoId: ${photoId}`);
      }

      console.log('PHOTO DATA: ', photoData);

      // Getting user data
      const getUserParams = {
        TableName: usersTable,
        Key: {
          userId
        }
      };

      const { Item: userData } = await docClient.send(new GetCommand(getUserParams));
      if (!userData) {
        throw new Error(`User record not found for userId: ${userId}, photoId: ${photoId}`);
      }

      console.log('USER DATA: ', userData);

      const firstName = userData.firstName || 'mscv2';
      const lastName = userData.lastName || 'group3';
      const currentDate = new Date().toISOString().split('T')[0];
      const watermarkText = `${firstName} ${lastName} | ${currentDate}`;

      const getObjectParams = { Bucket: bucket, Key: key };
      const { Body: imageStream } = await s3.send(new GetObjectCommand(getObjectParams));
      const imageBuffer = await streamToBuffer(imageStream);

      const processedImageBuffer = await addWatermarkWithCanvas(imageBuffer, watermarkText, fileExt);

      const processedKey = `users/${userId}/${photoId}.${fileExt}`;
      const putObjectParams = {
        Bucket: processedBucket,
        Key: processedKey,
        Body: processedImageBuffer,
        ContentType: `image/${fileExt}`
      };
      await s3.send(new PutObjectCommand(putObjectParams));

      const photoUrl = `https://${processedBucket}.s3.amazonaws.com/${processedKey}`;
      const updateParams = {
        TableName: photosTable,
        Key: {
          userId,
          photoId
        },
        UpdateExpression: 'SET photoUrl = :photoUrl, #st = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':photoUrl': photoUrl,
          ':status': 'processed',
          ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'UPDATED_NEW'
      };
      await docClient.send(new UpdateCommand(updateParams));

      console.log(`Successfully processed image: ${photoId}`);
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }
  
  return createResponse(200, { message: 'Image processing completed successfully' });
};

// Function to add watermark using canvas
async function addWatermarkWithCanvas(imageBuffer, watermarkText, format) {
  try {
    const image = await loadImage(imageBuffer);
    const width = image.width;
    const height = image.height;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    ctx.fillStyle = 'rgba(128, 128, 128, 0.7)';
    const fontSize = Math.max(16, Math.floor(width / 40));
    ctx.font = `bold ${fontSize}px Roboto`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    const padding = Math.floor(fontSize / 2);
    const xPosition = width - padding;
    const yPosition = height - padding;

    ctx.fillText(watermarkText, xPosition, yPosition);

    if (format === 'jpg' || format === 'jpeg') {
      return canvas.toBuffer('image/jpeg', { quality: 0.9 });
    } else if (format === 'png') {
      return canvas.toBuffer('image/png', { compressionLevel: 9 });
    } else if (format === 'webp') {
      return canvas.toBuffer('image/webp', { quality: 0.9 });
    } else {
      return canvas.toBuffer('image/png');
    }
  } catch (error) {
    console.error('Error adding watermark with canvas:', error);
    throw error;
  }
}

// Function to convert a stream to a buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
