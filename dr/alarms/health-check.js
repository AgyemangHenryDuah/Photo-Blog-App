// health-check.js
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { CloudWatchClient, DescribeAlarmsCommand } = require("@aws-sdk/client-cloudwatch");

// Initialize clients
const snsClient = new SNSClient();
const cloudWatchClient = new CloudWatchClient();

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
      
      // Determine alarm state from raw message
      const isAlarm = snsMessage.includes('ALARM');
      const isOK = snsMessage.includes('OK');
      
      // Send a notification based on the message content
      return await sendNotification({
        isAlarm,
        isOK,
        topicArn,
        domainName,
        environment,
        primaryRegion,
        rawMessage: snsMessage
      });
    }
    
    // Better state determination logic
    let isAlarm = false;
    let isOK = false;
    
    // Check for standard CloudWatch alarm format
    if (parsedMessage.NewStateValue) {
      isAlarm = parsedMessage.NewStateValue === 'ALARM';
      isOK = parsedMessage.NewStateValue === 'OK';
      console.log(`State from NewStateValue: ${parsedMessage.NewStateValue}, isAlarm: ${isAlarm}, isOK: ${isOK}`);
    }
    // Check for detailed alarm format
    else if (parsedMessage.AlarmName) {
      // Verify the current state of the alarm via API call
      try {
        const describeAlarmsCommand = new DescribeAlarmsCommand({
          AlarmNames: [parsedMessage.AlarmName]
        });
        
        const alarmResponse = await cloudWatchClient.send(describeAlarmsCommand);
        console.log('Current alarm state:', JSON.stringify(alarmResponse, null, 2));
        
        if (alarmResponse.MetricAlarms && alarmResponse.MetricAlarms.length > 0) {
          const currentState = alarmResponse.MetricAlarms[0].StateValue;
          isAlarm = currentState === 'ALARM';
          isOK = currentState === 'OK';
          console.log(`State from API: ${currentState}, isAlarm: ${isAlarm}, isOK: ${isOK}`);
        }
      } catch (cloudWatchError) {
        console.error('Error fetching alarm state:', cloudWatchError);
        // Fallback to message content
        isAlarm = snsMessage.includes('ALARM');
        isOK = snsMessage.includes('OK');
      }
    }
    // Fallback to checking the message content
    else {
      isAlarm = snsMessage.includes('ALARM') || snsMessage.toLowerCase().includes('unavailable');
      isOK = snsMessage.includes('OK') || snsMessage.toLowerCase().includes('restored');
      console.log(`State from message content, isAlarm: ${isAlarm}, isOK: ${isOK}`);
    }
    
    // Check the actual health check status if needed
    // If we have conflicting states, we can add direct Route53 API calls here
    
    return await sendNotification({
      isAlarm,
      isOK,
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

async function sendNotification({ isAlarm, isOK, topicArn, domainName, environment, primaryRegion, alarmDetails = {}, rawMessage = '' }) {
  const timestamp = new Date().toISOString();
  
  let subject, messageBody;
  
  // Only send notifications for definitive state changes
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
  } else if (isOK) {
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
  } else {
    console.log('Indeterminate state - no notification will be sent');
    return {
      statusCode: 200,
      body: JSON.stringify('No notification sent - indeterminate state')
    };
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