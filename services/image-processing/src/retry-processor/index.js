// Processing retry function - Moves messages from the Dead Letter Queue back to the main queue
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient();

const { createResponse, handleError } = require('/opt/nodejs/shared-utils/eventHandler.js');

exports.handler = async (event) => {
  console.log('Starting retry processor');
  
  // Get environment variables
  const processingQueueUrl = process.env.PROCESSING_QUEUE;
  const dlqUrl = process.env.DLQ_URL;
  
  if (!processingQueueUrl || !dlqUrl) {
    throw new Error('Missing required environment variables: PROCESSING_QUEUE or DLQ_URL');
  }
  
  try {
    // Maximum number of messages to process in a single invocation
    const maxMessages = 10;
    let processedCount = 0;
    
    // Process messages in batches until we've reached the maximum or no more messages are available
    while (processedCount < maxMessages) {
      // Receive messages from the DLQ
      const receiveParams = {
        QueueUrl: dlqUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 60, // 1 minute
        WaitTimeSeconds: 1     // Short polling to avoid timeout
      };
      
      const receiveResponse = await sqs.send(new ReceiveMessageCommand(receiveParams));
      const messages = receiveResponse.Messages || [];
      
      if (messages.length === 0) {
        console.log('No more messages in DLQ');
        break;
      }
      
      console.log(`Retrieved ${messages.length} messages from DLQ`);
      
      // Process each message
      for (const message of messages) {
        try {
          console.log(`Processing message: ${message.MessageId}`);
          
          // Send the message back to the main processing queue
          const sendParams = {
            QueueUrl: processingQueueUrl,
            MessageBody: message.Body,
            // Copy any message attributes
            MessageAttributes: message.MessageAttributes || {}
          };
          
          await sqs.send(new SendMessageCommand(sendParams));
          
          // Delete the message from the DLQ
          const deleteParams = {
            QueueUrl: dlqUrl,
            ReceiptHandle: message.ReceiptHandle
          };
          
          await sqs.send(new DeleteMessageCommand(deleteParams));
          
          console.log(`Successfully requeued message: ${message.MessageId}`);
          processedCount++;
        } catch (error) {
          console.error(`Error processing message ${message.MessageId}:`, error);
          // Skip to the next message, allowing this one to return to the DLQ 
          // after visibility timeout expires
        }
      }
    }
    
    console.log(`Retry processor completed - requeued ${processedCount} messages`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Retry processing completed',
        processedCount 
      })
    };
  } catch (error) {
    console.error('Error in retry processor:', error);
    throw error;
  }
};