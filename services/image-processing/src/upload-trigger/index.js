// Upload trigger function - Triggered when a new image is uploaded to the staging bucket
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { createResponse, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');
const sqs = new SQSClient();

exports.handler = async (event) => {
  console.log('Processing S3 event:', JSON.stringify(event, null, 2));
  
  // Get environment variables
  const queueUrl = process.env.PROCESSING_QUEUE;
  
  if (!queueUrl) {
    throw new Error('Missing required environment variable: PROCESSING_QUEUE');
  }
  
  try {
    // Process each record in the S3 event
    const promises = event.Records.map(async (record) => {
      // Extract bucket and key information from the S3 event
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      const size = record.s3.object.size;
      
      console.log(`New image uploaded: ${bucket}/${key} (${size} bytes)`);
      
      // Validate the key format (should be users/userId/photoId.ext)
      const keyParts = key.split('/');
      if (keyParts.length !== 3 || keyParts[0] !== 'users') {
        console.log(`Skipping file with invalid key format: ${key}`);
        return;
      }
      
      // Skip processing if it's not an image (simple check based on extension)
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const fileExtension = key.toLowerCase().substring(key.lastIndexOf('.'));
      
      if (!imageExtensions.includes(fileExtension)) {
        console.log(`Skipping non-image file: ${key}`);
        return;
      }
      
      // Create a message to send to the processing queue
      const message = {
        bucket,
        key,
        timestamp: new Date().toISOString(),
        size
      };
      
      // Send message to SQS queue
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          'FileType': {
            DataType: 'String',
            StringValue: fileExtension.substring(1) // Remove the dot
          }
        }
      });
      
      const response = await sqs.send(command);
      console.log(`Message sent to queue with ID: ${response.MessageId}`);
      
      return response;
    });
    
    // Wait for all promises to resolve
    await Promise.all(promises);
    
    return createResponse(200, { message: 'Images queued for processing' });

  } catch (error) {
    console.error('Error processing S3 event:', error);
    throw error;
  }
};