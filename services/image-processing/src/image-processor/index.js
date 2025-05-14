// Image processor function - Processes images from the SQS queue
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { createCanvas, loadImage } = require('canvas');
const stream = require('stream');

const { createResponse, parseBody, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

// Initialize clients
const s3 = new S3Client();
const dynamoClient = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(dynamoClient);

exports.handler = async (event) => {
  
  console.log('Architecture:', process.arch);

  console.log('Processing SQS event:', JSON.stringify(event, null, 2));
  
  // Get environment variables
  const stagingBucket = process.env.STAGING_BUCKET;
  const processedBucket = process.env.PROCESSED_BUCKET;
  const photosTable = process.env.PHOTOS_TABLE;
  
  if (!stagingBucket || !processedBucket || !photosTable) {
    throw new Error('Missing required environment variables');
  }
  
  // Process each record in the SQS event
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      console.log('Processing message:', messageBody);
      
      const { bucket, key } = messageBody;
      
      // Parse key format (expected format: users/userId/photoId.ext)
      const keyParts = key.split('/');
      if (keyParts.length !== 3 || keyParts[0] !== 'users') {
        throw new Error(`Invalid key format: ${key}. Expected format: users/userId/photoId.ext`);
      }
      
      const userId = keyParts[1];
      const fileNameWithExt = keyParts[2];
      const photoId = fileNameWithExt.substring(0, fileNameWithExt.lastIndexOf('.'));
      const fileExt = fileNameWithExt.substring(fileNameWithExt.lastIndexOf('.') + 1).toLowerCase();
      
      // Fetch user info from DynamoDB to get firstName and lastName
      console.log(`Retrieving user data for userId: ${userId}, photoId: ${photoId}`);
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
      
      const firstName = photoData.firstName || 'mscv2'; // Default if not found
      const lastName = photoData.lastName || 'group3';  // Default if not found
      
      // Get the current date for the watermark
      const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      // Create watermark text
      const watermarkText = `${firstName} ${lastName} | ${currentDate}`;
      
      // Get the image from S3
      console.log(`Retrieving image from ${bucket}/${key}`);
      const getObjectParams = {
        Bucket: bucket,
        Key: key
      };
      
      const { Body: imageStream } = await s3.send(new GetObjectCommand(getObjectParams));
      
      // Convert the stream to a buffer
      const imageBuffer = await streamToBuffer(imageStream);
      
      // Process the image with canvas - add watermark
      console.log('Processing image with watermark');
      const processedImageBuffer = await addWatermarkWithCanvas(imageBuffer, watermarkText, fileExt);
      
      // Upload the processed image to the processed bucket
      // Keep the same structure: users/userId/photoId.ext
      const processedKey = `users/${userId}/${photoId}.${fileExt}`;
      console.log(`Uploading processed image to ${processedBucket}/${processedKey}`);
      
      const putObjectParams = {
        Bucket: processedBucket,
        Key: processedKey,
        Body: processedImageBuffer,
        ContentType: `image/${fileExt}`
      };
      
      await s3.send(new PutObjectCommand(putObjectParams));
      
      // Construct the S3 URL for the processed image
      const photoUrl = `https://${processedBucket}.s3.amazonaws.com/${processedKey}`;
      
      // Update the photo record in DynamoDB with photoUrl and status
      console.log(`Updating photo metadata in DynamoDB table ${photosTable}`);

      const updateParams = {
        TableName: photosTable,
        Key: {
          userId,
          photoId
        },
        UpdateExpression: 'SET photoUrl = :photoUrl, #st = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#st': 'status'
        },
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
      throw error; // Let the SQS retry policy handle failures
    }
  }
  
  return createResponse(200, { message: 'Image processing completed successfully' });
};

// Function to add watermark using canvas (no dependency on system fonts)
async function addWatermarkWithCanvas(imageBuffer, watermarkText, format) {
  try {
    // Load the image
    const image = await loadImage(imageBuffer);
    const width = image.width;
    const height = image.height;
    
    // Create a canvas with the image dimensions
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw the original image on the canvas
    ctx.drawImage(image, 0, 0, width, height);
    
    // Configure watermark text styling
    ctx.fillStyle = 'rgba(128, 128, 128, 0.7)'; // Gray with 70% opacity
    
    // Use a generic font that's available in the canvas package
    // No dependency on system fonts
    const fontSize = Math.max(16, Math.floor(width / 40)); // Scale font with image size
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    // Calculate position (bottom right corner with padding)
    const padding = Math.floor(fontSize / 2);
    const xPosition = width - padding;
    const yPosition = height - padding;
    
    // Add the watermark text
    ctx.fillText(watermarkText, xPosition, yPosition);
    
    // Convert to buffer with appropriate format
    if (format === 'jpg' || format === 'jpeg') {
      return canvas.toBuffer('image/jpeg', { quality: 0.9 });
    } else if (format === 'png') {
      return canvas.toBuffer('image/png', { compressionLevel: 9 });
    } else if (format === 'webp') {
      return canvas.toBuffer('image/webp', { quality: 0.9 });
    } else {
      // Default to PNG for unsupported formats
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