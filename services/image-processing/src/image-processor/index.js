// Image processor function - Processes images from the SQS queue
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const sharp = require('sharp');
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
      const lastName = photoData.lastName || 'group3';      // Default if not found
      
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
      
      // Process the image with sharp - add watermark
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

// Function to add watermark to an image
// async function addWatermark(imageBuffer, watermarkText, format) {
//   try {
//     // Calculate image dimensions to position the watermark properly
//     const metadata = await sharp(imageBuffer).metadata();
//     const { width, height } = metadata;
    
//     // Create an SVG with the watermark text - positioned at bottom right corner with gray color
//     const svgBuffer = Buffer.from(`
//       <svg width="${width}" height="${height}">
//         <style>
//           .watermark {
//             fill: rgba(128, 128, 128, 0.7); /* Gray with 70% opacity */
//             font-size: 24px;
//             font-family: Arial, sans-serif;
//             font-weight: bold;
//           }
//         </style>
//         <text x="${width - 20}" y="${height - 20}" text-anchor="end" class="watermark">${watermarkText}</text>
//       </svg>
//     `);
    
//     // Apply the watermark
//     let sharpInstance = sharp(imageBuffer)
//       .composite([{
//         input: svgBuffer,
//         gravity: 'southeast'
//       }]);
    
//     // Ensure proper output format
//     if (format === 'jpg' || format === 'jpeg') {
//       sharpInstance = sharpInstance.jpeg({ quality: 90 });
//     } else if (format === 'png') {
//       sharpInstance = sharpInstance.png({ compressionLevel: 9 });
//     } else if (format === 'webp') {
//       sharpInstance = sharpInstance.webp({ quality: 90 });
//     } else if (format === 'gif') {
//       sharpInstance = sharpInstance.gif();
//     }
    
//     return await sharpInstance.toBuffer();
//   } catch (error) {
//     console.error('Error adding watermark:', error);
//     throw error;
//   }
// }

async function addWatermark(imageBuffer, watermarkText, format) {
  try {
    // Calculate image dimensions to position the watermark properly
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    // Create a simple watermark image with text
    // This approach avoids font system dependencies
    const watermarkImageBuffer = await createWatermarkImage(width, watermarkText);
    
    // Apply the watermark
    let sharpInstance = sharp(imageBuffer)
      .composite([{
        input: watermarkImageBuffer,
        gravity: 'southeast'
      }]);
    
    // Ensure proper output format
    if (format === 'jpg' || format === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ quality: 90 });
    } else if (format === 'png') {
      sharpInstance = sharpInstance.png({ compressionLevel: 9 });
    } else if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality: 90 });
    } else if (format === 'gif') {
      sharpInstance = sharpInstance.gif();
    }
    
    return await sharpInstance.toBuffer();
  } catch (error) {
    console.error('Error adding watermark:', error);
    throw error;
  }
}

// Helper function to create a watermark image without relying on system fonts
async function createWatermarkImage(width, watermarkText) {
  // Create an SVG that uses generic font-family values instead of specific fonts
  const paddingRight = 20;
  const paddingBottom = 20;
  const svgWidth = Math.min(width, watermarkText.length * 15 + 40); // Estimate text width
  const svgHeight = 40;
  
  const svgBuffer = Buffer.from(`
    <svg width="${svgWidth}" height="${svgHeight}">
      <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" 
            fill="rgba(255, 255, 255, 0.4)" rx="5" ry="5" />
      <text x="${svgWidth/2}" y="${svgHeight/2 + 8}" 
            font-family="sans-serif" 
            font-size="18px" 
            text-anchor="middle" 
            fill="rgba(80, 80, 80, 0.8)">${watermarkText}</text>
    </svg>
  `);
  
  // Convert the SVG to a PNG buffer
  return await sharp(svgBuffer)
    .png()
    .toBuffer();
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