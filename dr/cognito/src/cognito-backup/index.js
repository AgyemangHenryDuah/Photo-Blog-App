
import { 
    CognitoIdentityProviderClient, 
    ListUsersCommand,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminUpdateUserAttributesCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { 
    DynamoDBClient,
    PutItemCommand,
    ScanCommand,
    QueryCommand
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Initialize clients for primary and DR regions
const primaryRegion = process.env.AWS_REGION;
const drRegion = process.env.BACKUP_REGION;

const primaryCognito = new CognitoIdentityProviderClient({ region: primaryRegion });
const drCognito = new CognitoIdentityProviderClient({ region: drRegion });
const dynamoClient = new DynamoDBClient({ region: primaryRegion });

export const handler = async (event) => {
    console.log('Starting Cognito User Pool backup process...');
    
    try {
        // Export users from primary User Pool
        const users = await exportUsersFromPrimaryPool();
        console.log(`Found ${users.length} users to backup`);
        
        // Store backup in DynamoDB Global Table
        await storeUsersInBackupTable(users);
        console.log('Users stored in backup table');
        
        // Create/Update users in DR User Pool
        await syncUsersToDRPool(users);
        console.log('Users synced to DR User Pool');
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Backup completed successfully',
                usersBackedUp: users.length,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Backup failed:', error);
        throw error;
    }
};

async function exportUsersFromPrimaryPool() {
    const users = [];
    let paginationToken = null;
    
    do {
        const params = {
            UserPoolId: process.env.USER_POOL_ID,
            Limit: 60, // Cognito limit
            ...(paginationToken && { PaginationToken: paginationToken })
        };
        
        const command = new ListUsersCommand(params);
        const response = await primaryCognito.send(command);
        
        // Process and format user data
        for (const user of response.Users) {
            const formattedUser = {
                sub: user.Username,
                email: getAttributeValue(user.Attributes, 'email'),
                firstName: getAttributeValue(user.Attributes, 'custom:firstName'),
                lastName: getAttributeValue(user.Attributes, 'custom:lastName'),
                userStatus: user.UserStatus,
                enabled: user.Enabled,
                userCreateDate: user.UserCreateDate,
                userLastModifiedDate: user.UserLastModifiedDate,
                attributes: user.Attributes,
                temporaryPassword: user.UserStatus === 'FORCE_CHANGE_PASSWORD'
            };
            users.push(formattedUser);
        }
        
        paginationToken = response.PaginationToken;
    } while (paginationToken);
    
    return users;
}

async function storeUsersInBackupTable(users) {
    const tableName = process.env.BACKUP_TABLE;
    const batchSize = 25; // DynamoDB batch write limit
    
    for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        for (const user of batch) {
            const item = {
                ...user,
                backupTimestamp: new Date().toISOString(),
                backupVersion: generateBackupVersion()
            };
            
            const params = {
                TableName: tableName,
                Item: marshall(item)
            };
            
            const command = new PutItemCommand(params);
            await dynamoClient.send(command);
        }
    }
}

async function syncUsersToDRPool(users) {
    const drUserPoolId = process.env.DR_USER_POOL_ID;
    
    for (const user of users) {
        try {
            // Check if user already exists in DR pool
            const existingUsers = await queryExistingUser(user.email);
            
            if (existingUsers.length === 0) {
                // Create new user in DR pool
                await createUserInDRPool(drUserPoolId, user);
            } else {
                // Update existing user
                await updateUserInDRPool(drUserPoolId, existingUsers[0].sub, user);
            }
            
        } catch (error) {
            console.error(`Failed to sync user ${user.email}:`, error);
            // Continue with other users even if one fails
        }
    }
}

async function createUserInDRPool(userPoolId, user) {
    const messageAction = user.userStatus === 'CONFIRMED' ? 'SUPPRESS' : 'RESEND';
    
    const params = {
        UserPoolId: userPoolId,
        Username: user.sub,
        UserAttributes: user.attributes,
        MessageAction: messageAction,
        TemporaryPassword: user.temporaryPassword ? generateTemporaryPassword() : undefined
    };
    
    const command = new AdminCreateUserCommand(params);
    await drCognito.send(command);
    
    // Set user status if confirmed
    if (user.userStatus === 'CONFIRMED') {
        await setUserPasswordInDRPool(userPoolId, user.sub);
    }
}

async function updateUserInDRPool(userPoolId, username, user) {
    const params = {
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: user.attributes
    };
    
    const command = new AdminUpdateUserAttributesCommand(params);
    await drCognito.send(command);
}

async function setUserPasswordInDRPool(userPoolId, username) {
    const params = {
        UserPoolId: userPoolId,
        Username: username,
        Password: generateTemporaryPassword(),
        Permanent: false
    };
    
    const command = new AdminSetUserPasswordCommand(params);
    await drCognito.send(command);
}

async function queryExistingUser(email) {
    const params = {
        TableName: process.env.BACKUP_TABLE,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: marshall({
            ':email': email
        })
    };
    
    const command = new QueryCommand(params);
    const response = await dynamoClient.send(command);
    
    return response.Items.map(item => unmarshall(item));
}

function getAttributeValue(attributes, name) {
    const attribute = attributes.find(attr => attr.Name === name);
    return attribute ? attribute.Value : null;
}

function generateBackupVersion() {
    return `backup-${Date.now()}`;
}

function generateTemporaryPassword() {
    // Generate a secure temporary password (will be changed on first login)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password + 'A1!'; // Ensure it meets Cognito password requirements
}