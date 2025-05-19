// Import SDK v3 clients
const { CognitoIdentityProviderClient, ListUsersCommand, AdminGetUserCommand, 
    AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
  
  exports.handler = async (event) => {
      console.log('Starting Cognito user backup...');
      
      const primaryRegion = process.env.PRIMARY_REGION;
      console.log('PRIMARY USER POOL ID FROM ENV: ', process.env.USER_POOL_ID)
      const userPoolId = process.env.USER_POOL_ID.includes(':') 
        ? process.env.USER_POOL_ID.split('/').pop() // Extract just the ID part if it's an ARN
        : process.env.USER_POOL_ID; // Use as-is if it's already just the ID
      console.log('EXTRACTED PRIMARY USER POOL ID: ', userPoolId)
      const drUserPoolId = process.env.DR_USER_POOL_ID.includes(':') 
        ? process.env.DR_USER_POOL_ID.split('/').pop() // Extract just the ID part if it's an ARN
        : process.env.DR_USER_POOL_ID; // Use as-is if it's already just the ID
      const backupTableName = process.env.BACKUP_TABLE;
      
      try {
          // Set up clients for both regions
          const primaryCognitoClient = new CognitoIdentityProviderClient({ region: primaryRegion });
          const drCognitoClient = new CognitoIdentityProviderClient(); // Uses the region the Lambda is deployed in
          const dynamoClient = new DynamoDBClient();
          const docClient = DynamoDBDocumentClient.from(dynamoClient);
          
          // Get all users from primary user pool
          console.log(`Fetching users from primary user pool: ${userPoolId}`);
          const primaryUsers = await getAllUsers(primaryCognitoClient, userPoolId);
          console.log(`Found ${primaryUsers.length} users in primary region`);
          
          // Back up each user to DR region
          for (const user of primaryUsers) {
              try {
                  await backupUser(user, drCognitoClient, drUserPoolId);
                  await recordBackupStatus(user, docClient, backupTableName, true);
              } catch (error) {
                  console.error(`Error backing up user ${user.Username}:`, error);
                  await recordBackupStatus(user, docClient, backupTableName, false, error.message);
              }
          }
          
          return {
              statusCode: 200,
              body: JSON.stringify({
                  message: `Successfully backed up ${primaryUsers.length} users`,
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
          const params = {
              UserPoolId: userPoolId,
              Limit: 60,
              ...(paginationToken && { PaginationToken: paginationToken }),
          };
          
          const command = new ListUsersCommand(params);
          const response = await cognitoClient.send(command);
          users = users.concat(response.Users);
          paginationToken = response.PaginationToken;
      } while (paginationToken);
      
      return users;
  }
  
  async function backupUser(user, drCognitoClient, drUserPoolId) {
      const email = user.Attributes.find(attr => attr.Name === 'email')?.Value;
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
      const email = user.Attributes.find(attr => attr.Name === 'email')?.Value;
      
      const userAttributes = user.Attributes
          .filter(attr => !['sub'].includes(attr.Name)) // Filter out attributes that shouldn't be copied
          .map(attr => {
              return {
                  Name: attr.Name,
                  Value: attr.Value,
              };
          });
      
      const createParams = {
          UserPoolId: drUserPoolId,
          Username: email,
          TemporaryPassword: generateTempPassword(),
          UserAttributes: userAttributes,
          MessageAction: 'SUPPRESS', // Don't send welcome email
      };
      
      const createCommand = new AdminCreateUserCommand(createParams);
      await drCognitoClient.send(createCommand);
      
      // Set permanent password (instead of temporary)
      const passwordParams = {
          UserPoolId: drUserPoolId,
          Username: email,
          Password: generateTempPassword(),
          Permanent: true,
      };
      
      const passwordCommand = new AdminSetUserPasswordCommand(passwordParams);
      await drCognitoClient.send(passwordCommand);
      
      return true;
  }
  
  async function updateUserAttributes(user, drCognitoClient, drUserPoolId) {
      const email = user.Attributes.find(attr => attr.Name === 'email')?.Value;
      
      const userAttributes = user.Attributes
          .filter(attr => !['sub', 'email'].includes(attr.Name)) // Don't update email or sub
          .map(attr => {
              return {
                  Name: attr.Name,
                  Value: attr.Value,
              };
          });
      
      if (userAttributes.length > 0) {
          const params = {
              UserPoolId: drUserPoolId,
              Username: email,
              UserAttributes: userAttributes,
          };
          
          const command = new AdminUpdateUserAttributesCommand(params);
          await drCognitoClient.send(command);
      }
      
      return true;
  }
  
  async function recordBackupStatus(user, docClient, tableName, success, errorMessage = null) {
      const email = user.Attributes.find(attr => attr.Name === 'email')?.Value;
      const sub = user.Attributes.find(attr => attr.Name === 'sub')?.Value;
      
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
          ...(errorMessage && { errorMessage: errorMessage }),
      };
      
      const command = new PutCommand({
          TableName: tableName,
          Item: item,
      });
      
      await docClient.send(command);
  }
  
  function generateTempPassword() {
      // Generate a secure random password (this is just for DR, not for actual user login)
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
      let password = '';
      for (let i = 0; i < 20; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
  }