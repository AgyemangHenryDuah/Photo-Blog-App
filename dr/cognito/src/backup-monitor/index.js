
import {
    DynamoDBClient,
    PutItemCommand
} from '@aws-sdk/client-dynamodb';
import {
    SNSClient,
    PublishCommand
} from '@aws-sdk/client-sns';
import { marshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({});
const snsClient = new SNSClient({});

export const handler = async (event) => {
    console.log('Processing backup status update:', JSON.stringify(event, null, 2));
    
    for (const record of event.Records) {
        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
            await processBackupStatusUpdate(record);
        }
    }
    
    return { statusCode: 200 };
};

async function processBackupStatusUpdate(record) {
    const { dynamodb, eventName } = record;
    
    if (eventName === 'INSERT') {
        // New backup started
        const newImage = dynamodb.NewImage;
        
        if (newImage.status?.S === 'STARTED') {
            console.log('Backup started:', newImage.backupId?.S);
            await sendNotification(
                'Cognito Backup Started',
                `Backup ${newImage.backupId?.S} has started at ${newImage.timestamp?.S}`
            );
        }
        
        if (newImage.status?.S === 'COMPLETED') {
            console.log('Backup completed:', newImage.backupId?.S);
            await sendNotification(
                'Cognito Backup Completed Successfully',
                `Backup ${newImage.backupId?.S} completed successfully.\n` +
                `Users backed up: ${newImage.usersBackedUp?.N}\n` +
                `Duration: ${newImage.duration?.S}`
            );
        }
        
        if (newImage.status?.S === 'FAILED') {
            console.log('Backup failed:', newImage.backupId?.S);
            await sendNotification(
                'Cognito Backup Failed',
                `Backup ${newImage.backupId?.S} failed.\n` +
                `Error: ${newImage.errorMessage?.S}\n` +
                `Timestamp: ${newImage.timestamp?.S}`,
                true
            );
        }
    }
}

async function sendNotification(subject, message, isError = false) {
    const params = {
        TopicArn: process.env.SNS_TOPIC_ARN,
        Subject: `[${isError ? 'ERROR' : 'INFO'}] ${subject}`,
        Message: message
    };
    
    try {
        const command = new PublishCommand(params);
        await snsClient.send(command);
        console.log('Notification sent successfully');
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

async function logBackupStatus(status, details) {
    const backupId = details.backupId || `backup-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    const item = {
        backupId,
        timestamp,
        status,
        ...details,
        ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
    };
    
    const params = {
        TableName: process.env.BACKUP_STATUS_TABLE,
        Item: marshall(item)
    };
    
    try {
        const command = new PutItemCommand(params);
        await dynamoClient.send(command);
        console.log('Backup status logged successfully');
    } catch (error) {
        console.error('Failed to log backup status:', error);
    }
}