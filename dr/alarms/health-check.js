// index.js
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
  
  try {
    // Parse the SNS message
    const message = event.Records[0].Sns.Message;
    const parsedMessage = JSON.parse(message);
    
    // Determine if this is an alarm or OK notification
    const isAlarm = parsedMessage.NewStateValue === 'ALARM';
    const timestamp = new Date().toISOString();
    
    // Prepare notification content
    let subject, messageBody;
    
    if (isAlarm) {
      subject = `⚠️ ALERT: Frontend Outage Detected for ${domainName}`;
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
      subject = `✅ RESOLVED: Frontend Service Recovered for ${domainName}`;
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
    
    // Create the publish command
    const publishCommand = new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: messageBody
    });
    
    // Send notification
    await snsClient.send(publishCommand);
    
    return {
      statusCode: 200,
      body: JSON.stringify('Notification sent successfully')
    };
  } catch (error) {
    console.error('Error processing alarm notification:', error);
    return {
      statusCode: 500,
      body: JSON.stringify(`Error: ${error.message}`)
    };
  }
};