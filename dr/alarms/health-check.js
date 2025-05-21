// health-check.js
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

// Initialize SNS client
const snsClient = new SNSClient();

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Environmental variables
  const topicArn = process.env.NOTIFICATION_TOPIC_ARN;
  const domainName = process.env.DOMAIN_NAME;
  const environment = process.env.ENVIRONMENT;
  const primaryRegion = process.env.PRIMARY_REGION;
  const backupRegion = process.env.BACKUP_REGION;
  
  if (!topicArn) {
    console.error('Missing NOTIFICATION_TOPIC_ARN environment variable');
    return {
      statusCode: 500,
      body: JSON.stringify('Configuration error: Missing NOTIFICATION_TOPIC_ARN')
    };
  }
  
  try {
    if (!event.Records || !event.Records[0] || !event.Records[0].Sns) {
      console.error('Unexpected event format:', event);
      return {
        statusCode: 400,
        body: JSON.stringify('Invalid event format')
      };
    }
    
    // Parse the SNS message
    const snsMessage = event.Records[0].Sns.Message;
    console.log('SNS Message:', snsMessage);
    
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(snsMessage);
    } catch (parseError) {
      console.error('Error parsing SNS message:', parseError);
      console.log('Raw message content:', snsMessage);
      // Fallback to checking the raw message for ALARM status
      const isRawAlarm = snsMessage.includes('ALARM');
      
      // Send a generic notification with the raw message
      return await sendNotification({
        isAlarm: isRawAlarm,
        topicArn,
        domainName,
        environment,
        primaryRegion,
        rawMessage: snsMessage
      });
    }
    
    // Determine if this is an alarm or OK notification - handle different formats
    let isAlarm = false;
    
    // CloudWatch Alarm format
    if (parsedMessage.NewStateValue) {
      isAlarm = parsedMessage.NewStateValue === 'ALARM';
    } 
    // Alternative format that might be used
    else if (parsedMessage.AlarmName && parsedMessage.NewStateValue) {
      isAlarm = parsedMessage.NewStateValue === 'ALARM';
    }
    // Another possible format
    else if (parsedMessage.Trigger && parsedMessage.Trigger.MetricName === 'HealthCheckStatus') {
      isAlarm = parsedMessage.NewStateValue === 'ALARM' || 
                (parsedMessage.Trigger.Statistic === 'Minimum' && 
                 parsedMessage.Trigger.ComparisonOperator === 'LessThanThreshold');
    }
    // If we can't determine the state from parsed JSON, look for "ALARM" in raw message
    else {
      isAlarm = snsMessage.includes('ALARM');
    }
    
    return await sendNotification({
      isAlarm,
      topicArn,
      domainName,
      environment,
      primaryRegion,
      alarmDetails: parsedMessage
    });
    
  } catch (error) {
    console.error('Error processing alarm notification:', error);
    
    // Attempt to send an error notification
    try {
      const errorCommand = new PublishCommand({
        TopicArn: topicArn,
        Subject: `⚠️ ERROR: Health Check Lambda Failure for ${domainName}`,
        Message: `The health check Lambda function encountered an error: ${error.message}\n\nPlease check Lambda logs for more details.`
      });
      
      await snsClient.send(errorCommand);
    } catch (snsError) {
      console.error('Failed to send error notification:', snsError);
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify(`Error: ${error.message}`)
    };
  }
};

async function sendNotification({ isAlarm, topicArn, domainName, environment, primaryRegion, alarmDetails = {}, rawMessage = '' }) {
  const timestamp = new Date().toISOString();
  
  let subject, messageBody;
  
  if (isAlarm) {
    subject = `⚠️ ALERT: Service Outage Detected for ${domainName}`;
    messageBody = `
FRONTEND SERVICE OUTAGE NOTIFICATION
=====================================
Timestamp: ${timestamp}
Domain: ${domainName}
Environment: ${environment}
Primary Region: ${primaryRegion}
Status: SERVICE UNAVAILABLE

The frontend application at https://${domainName} is currently unreachable.
Route 53 health checks have failed consecutively, indicating a service outage.

Recommended Actions:
1. Check the status of your frontend services in ${primaryRegion}
2. Verify that your CloudFront distribution is functioning correctly
3. Check for any deployment issues that may have occurred
4. Ensure that your origin servers are responding properly

This is an automated message from the Health Check Monitoring System.
`;
  } else {
    subject = `✅ RESOLVED: Service Recovered for ${domainName}`;
    messageBody = `
FRONTEND SERVICE RECOVERY NOTIFICATION
=====================================
Timestamp: ${timestamp}
Domain: ${domainName}
Environment: ${environment}
Primary Region: ${primaryRegion}
Status: SERVICE RESTORED

The frontend application at https://${domainName} is now reachable again.
Route 53 health checks are now passing successfully.

No further action is required.

This is an automated message from the Health Check Monitoring System.
`;
  }
  
  if (Object.keys(alarmDetails).length > 0) {
    messageBody += `\n\nAlarm Details:\n${JSON.stringify(alarmDetails, null, 2)}`;
  }
  
  if (rawMessage) {
    messageBody += `\n\nRaw Message:\n${rawMessage}`;
  }
  
  // Create the publish command
  const publishCommand = new PublishCommand({
    TopicArn: topicArn,
    Subject: subject,
    Message: messageBody
  });
  
  // Send notification and log the result
  try {
    const result = await snsClient.send(publishCommand);
    console.log('SNS notification sent successfully:', result);
    return {
      statusCode: 200,
      body: JSON.stringify('Notification sent successfully')
    };
  } catch (error) {
    console.error('Failed to send SNS notification:', error);
    return {
      statusCode: 500,
      body: JSON.stringify(`Failed to send notification: ${error.message}`)
    };
  }
}