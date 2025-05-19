// Import SDK v3 clients
const { 
    CognitoIdentityProviderClient, 
    ListUsersCommand, 
    AdminGetUserCommand, 
    AdminCreateUserCommand, 
    AdminSetUserPasswordCommand, 
    AdminUpdateUserAttributesCommand 
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

exports.handler = async (event) => {
    console.log('Starting Cognito user backup...');
    
    const primaryRegion = process.env.PRIMARY_REGION;
    const userPoolArn = process.env.USER_POOL_ARN; // Full ARN
    const drUserPoolArn = process.env.DR_USER_POOL_ID; // This is actually an ARN too
    const backupTableName = process.env.BACKUP_TABLE;
    
    // Extract user pool IDs from ARNs
    // ARN format: arn:aws:cognito-idp:region:account:userpool/pool-id
    const userPoolId = userPoolArn.split('/')[1]; // Get the part after the last slash
    const drUserPoolId = drUserPoolArn.split('/')[1]; // Get the part after the last slash
    
    console.log('PRIMARY USER POOL ARN: ', userPoolArn);
    console.log('EXTRACTED PRIMARY USER POOL ID: ', userPoolId);
    console.log('DR USER POOL ARN: ', drUserPoolArn);
    console.log('EXTRACTED DR USER POOL ID: ', drUserPoolId);
    
    try {
        // Set up clients for both regions - explicitly specify regions
        console.log(`Setting up primary client for region: ${primaryRegion}`);
        console.log(`Setting up DR client for current Lambda region`);
        
        const primaryCognitoClient = new CognitoIdentityProviderClient({ 
            region: primaryRegion 
        });
        const drCognitoClient = new CognitoIdentityProviderClient({ 
            region: process.env.AWS_REGION || 'eu-west-1' // Explicitly set DR region
        });
        const dynamoClient = new DynamoDBClient();
        const docClient = DynamoDBDocumentClient.from(dynamoClient);
        
        // Get all users from primary user pool
        console.log(`Fetching users from primary user pool: ${userPoolId} in region: ${primaryRegion}`);
        const primaryUsers = await getAllUsers(primaryCognitoClient, userPoolId);
        console.log(`Found ${primaryUsers.length} users in primary region`);
        
        // Back up each user to DR region
        let successCount = 0;
        let failureCount = 0;
        
        for (const user of primaryUsers) {
            try {
                await backupUser(user, drCognitoClient, drUserPoolId);
                await recordBackupStatus(user, docClient, backupTableName, true);
                successCount++;
                console.log(`Successfully backed up user: ${user.Username}`);
            } catch (error) {
                console.error(`Error backing up user ${user.Username}:`, error);
                await recordBackupStatus(user, docClient, backupTableName, false, error.message);
                failureCount++;
            }
        }
        
        console.log(`Backup completed. Success: ${successCount}, Failures: ${failureCount}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Backup completed. Success: ${successCount}, Failures: ${failureCount}`,
                totalUsers: primaryUsers.length,
                successCount: successCount,
                failureCount: failureCount
            }),
        };
    } catch (error) {
        console.error('Error in backup process:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error in backup process',
                error: error.message,
            }),
        };
    }
};

async function getAllUsers(cognitoClient, userPoolId) {
    let users = [];
    let paginationToken = null;
    
    do {
        try {
            const params = {
                UserPoolId: userPoolId,
                Limit: 60,
                ...(paginationToken && { PaginationToken: paginationToken }),
            };
            
            const command = new ListUsersCommand(params);
            const response = await cognitoClient.send(command);
            users = users.concat(response.Users || []);
            paginationToken = response.PaginationToken;
            
            console.log(`Fetched ${response.Users?.length || 0} users in this batch. Total so far: ${users.length}`);
        } catch (error) {
            console.error(`Error listing users: ${error.message}`);
            throw error;
        }
    } while (paginationToken);
    
    return users;
}

async function backupUser(user, drCognitoClient, drUserPoolId) {
    const email = user.Attributes?.find(attr => attr.Name === 'email')?.Value;
    if (!email) {
        throw new Error(`User ${user.Username} has no email attribute`);
    }
    
    // Check if user already exists in DR pool
    try {
        const command = new AdminGetUserCommand({
            UserPoolId: drUserPoolId,
            Username: email
        });
        await drCognitoClient.send(command);
        
        // User exists, update attributes if needed
        console.log(`User ${email} already exists in DR pool, updating attributes`);
        return await updateUserAttributes(user, drCognitoClient, drUserPoolId);
    } catch (error) {
        if (error.name === 'UserNotFoundException') {
            // User doesn't exist, create them
            console.log(`Creating user ${email} in DR pool`);
            return await createUser(user, drCognitoClient, drUserPoolId);
        }
        throw error;
    }
}

async function createUser(user, drCognitoClient, drUserPoolId) {
    const email = user.Attributes?.find(attr => attr.Name === 'email')?.Value;
    
    const userAttributes = user.Attributes
        ?.filter(attr => !['sub', 'email_verified', 'cognito:mfa_enabled', 'cognito:user_status'].includes(attr.Name)) // Filter out system attributes
        .map(attr => {
            // Handle custom attributes properly
            let attributeName = attr.Name;
            if (attributeName.startsWith('custom:')) {
                // Custom attributes should be kept as-is
            } else if (attributeName === 'given_name') {
                // Map given_name to firstName if that's what your schema expects
                attributeName = 'custom:firstName';
            } else if (attributeName === 'family_name') {
                // Map family_name to lastName if that's what your schema expects
                attributeName = 'custom:lastName';
            }
            
            return {
                Name: attributeName,
                Value: attr.Value,
            };
        }) || [];
    
    // Ensure email is included
    if (!userAttributes.find(attr => attr.Name === 'email')) {
        userAttributes.push({
            Name: 'email',
            Value: email
        });
    }
    
    const tempPassword = generateTempPassword();
    
    const createParams = {
        UserPoolId: drUserPoolId,
        Username: email,
        TemporaryPassword: tempPassword,
        UserAttributes: userAttributes,
        MessageAction: 'SUPPRESS', // Don't send welcome email
    };
    
    console.log(`Creating user with attributes:`, userAttributes);
    
    const createCommand = new AdminCreateUserCommand(createParams);
    await drCognitoClient.send(createCommand);
    
    // Set permanent password (instead of temporary)
    const passwordParams = {
        UserPoolId: drUserPoolId,
        Username: email,
        Password: tempPassword,
        Permanent: true,
    };
    
    const passwordCommand = new AdminSetUserPasswordCommand(passwordParams);
    await drCognitoClient.send(passwordCommand);
    
    return true;
}

async function updateUserAttributes(user, drCognitoClient, drUserPoolId) {
    const email = user.Attributes?.find(attr => attr.Name === 'email')?.Value;
    
    const userAttributes = user.Attributes
        ?.filter(attr => !['sub', 'email', 'email_verified', 'cognito:mfa_enabled', 'cognito:user_status'].includes(attr.Name)) // Don't update system attributes
        .map(attr => {
            // Handle custom attributes properly
            let attributeName = attr.Name;
            if (attributeName.startsWith('custom:')) {
                // Custom attributes should be kept as-is
            } else if (attributeName === 'given_name') {
                // Map given_name to firstName if that's what your schema expects
                attributeName = 'custom:firstName';
            } else if (attributeName === 'family_name') {
                // Map family_name to lastName if that's what your schema expects
                attributeName = 'custom:lastName';
            }
            
            return {
                Name: attributeName,
                Value: attr.Value,
            };
        }) || [];
    
    if (userAttributes.length > 0) {
        const params = {
            UserPoolId: drUserPoolId,
            Username: email,
            UserAttributes: userAttributes,
        };
        
        console.log(`Updating user ${email} with attributes:`, userAttributes);
        
        const command = new AdminUpdateUserAttributesCommand(params);
        await drCognitoClient.send(command);
    }
    
    return true;
}

async function recordBackupStatus(user, docClient, tableName, success, errorMessage = null) {
    const email = user.Attributes?.find(attr => attr.Name === 'email')?.Value;
    const sub = user.Attributes?.find(attr => attr.Name === 'sub')?.Value;
    
    if (!sub) {
        console.warn(`User ${email} has no sub attribute, skipping backup record`);
        return;
    }
    
    const item = {
        sub: sub,
        email: email,
        username: user.Username,
        lastBackup: new Date().toISOString(),
        success: success,
        userStatus: user.UserStatus,
        enabled: user.Enabled,
        createdDate: user.UserCreateDate?.toISOString(),
        lastModifiedDate: user.UserLastModifiedDate?.toISOString(),
        ...(errorMessage && { errorMessage: errorMessage }),
    };
    
    const command = new PutCommand({
        TableName: tableName,
        Item: item,
    });
    
    try {
        await docClient.send(command);
    } catch (error) {
        console.error(`Error recording backup status for user ${email}:`, error);
        // Don't throw here as it's not critical to the backup process
    }
}

function generateTempPassword() {
    // Generate a secure random password (this is just for DR, not for actual user login)
    // Ensure it meets Cognito's password policy requirements
    const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()';
    
    let password = '';
    
    // Ensure at least one character from each required set
    password += upperCase.charAt(Math.floor(Math.random() * upperCase.length));
    password += lowerCase.charAt(Math.floor(Math.random() * lowerCase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += symbols.charAt(Math.floor(Math.random() * symbols.length));
    
    // Fill the rest randomly
    const allChars = upperCase + lowerCase + numbers + symbols;
    for (let i = 4; i < 20; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    
    // Shuffle the password to randomize the position of required characters
    return password.split('').sort(() => Math.random() - 0.5).join('');
}