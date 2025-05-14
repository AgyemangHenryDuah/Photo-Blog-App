// Image processor function - Processes images from the SQS queue
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const Jimp = require('jimp');
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
      
      // Process the image with jimp - add watermark
      console.log('Processing image with watermark');
      const processedImageBuffer = await addWatermark(imageBuffer, watermarkText, fileExt);
      
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

// Function to add watermark using Jimp (no font dependency)
async function addWatermark(imageBuffer, watermarkText, format) {
  try {
    // Load the image with Jimp
    const image = await Jimp.read(imageBuffer);
    
    // Set watermark properties
    const width = image.getWidth();
    const height = image.getHeight();
    const size = Math.max(16, Math.floor(width / 40)); // Dynamic size based on image width
    const padding = Math.floor(size / 2);
    
    // Create a semi-transparent rectangle for the watermark background
    const watermarkWidth = watermarkText.length * (size * 0.6); // Approximate width
    const watermarkHeight = size * 1.2;
    const rectX = width - watermarkWidth - padding;
    const rectY = height - watermarkHeight - padding;
    
    // Draw semi-transparent background for better text visibility
    image.scan(rectX, rectY, watermarkWidth, watermarkHeight, function(x, y, idx) {
      // Create semi-transparent overlay
      image.setPixelColor(Jimp.rgbaToInt(128, 128, 128, 100), x, y);
    });
    
    // Draw watermark text using primitive pixel operations
    // This approach avoids any system font dependencies
    
    // Split watermark into characters
    const chars = watermarkText.split('');
    
    // Draw each character
    for (let i = 0; i < chars.length; i++) {
      const charX = rectX + (i * size * 0.6);
      const charY = rectY + (size * 0.1);
      
      // Draw the character using an alternative method
      drawCharacter(image, chars[i], charX, charY, size);
    }
    
    // Get buffer in appropriate format
    let mimeType;
    if (format === 'jpg' || format === 'jpeg') {
      mimeType = Jimp.MIME_JPEG;
      image.quality(90);
    } else if (format === 'png') {
      mimeType = Jimp.MIME_PNG;
    } else if (format === 'webp') {
      // Fallback to PNG as Jimp doesn't natively support WebP
      mimeType = Jimp.MIME_PNG;
    } else {
      // Default to PNG for unsupported formats
      mimeType = Jimp.MIME_PNG;
    }
    
    return await image.getBufferAsync(mimeType);
  } catch (error) {
    console.error('Error adding watermark with Jimp:', error);
    throw error;
  }
}

// Function to draw a character without relying on fonts
function drawCharacter(image, char, x, y, size) {
  // Very simplified character drawing - just using white pixels
  const color = Jimp.rgbaToInt(255, 255, 255, 200); // White with some transparency
  const strokeWidth = Math.max(1, Math.floor(size / 10));
  
  // Simplified pixel-based characters
  // This is a very primitive approach but works without any font dependencies
  
  // Convert coordinates to integers
  const startX = Math.floor(x);
  const startY = Math.floor(y);
  const charWidth = Math.floor(size * 0.6);
  const charHeight = Math.floor(size);
  
  // Draw different characters differently
  switch(char.toUpperCase()) {
    case ' ':
      // Space - do nothing
      break;
      
    case '|':
      // Vertical line
      for (let i = 0; i < charHeight; i++) {
        for (let j = 0; j < strokeWidth; j++) {
          image.setPixelColor(color, startX + Math.floor(charWidth/2) - Math.floor(strokeWidth/2) + j, startY + i);
        }
      }
      break;
      
    case '-':
      // Horizontal line
      for (let i = 0; i < charWidth; i++) {
        for (let j = 0; j < strokeWidth; j++) {
          image.setPixelColor(color, startX + i, startY + Math.floor(charHeight/2) - Math.floor(strokeWidth/2) + j);
        }
      }
      break;
      
    default:
      // For letters, draw a simplified representation
      // Top line
      if ('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.includes(char.toUpperCase())) {
        for (let i = 0; i < charWidth; i++) {
          for (let j = 0; j < strokeWidth; j++) {
            image.setPixelColor(color, startX + i, startY + j);
          }
        }
      }
      
      // Bottom line
      if ('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.includes(char.toUpperCase())) {
        for (let i = 0; i < charWidth; i++) {
          for (let j = 0; j < strokeWidth; j++) {
            image.setPixelColor(color, startX + i, startY + charHeight - strokeWidth + j);
          }
        }
      }
      
      // Left line
      if ('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.includes(char.toUpperCase())) {
        for (let i = 0; i < strokeWidth; i++) {
          for (let j = 0; j < charHeight; j++) {
            image.setPixelColor(color, startX + i, startY + j);
          }
        }
      }
      
      // Right line
      if ('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.includes(char.toUpperCase())) {
        for (let i = 0; i < strokeWidth; i++) {
          for (let j = 0; j < charHeight; j++) {
            image.setPixelColor(color, startX + charWidth - strokeWidth + i, startY + j);
          }
        }
      }
      
      // Middle line for some characters
      if ('ABEFHPR0348'.includes(char.toUpperCase())) {
        for (let i = 0; i < charWidth; i++) {
          for (let j = 0; j < strokeWidth; j++) {
            image.setPixelColor(color, startX + i, startY + Math.floor(charHeight/2) - Math.floor(strokeWidth/2) + j);
          }
        }
      }
      break;
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