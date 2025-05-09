// Implement Lambda for Cognito backup (daily snapshot) accordingly

const { CognitoIdentityServiceProvider } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

const cognito = new CognitoIdentityServiceProvider();
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    try {
        const userPoolId = process.env.USER_POOL_ID;
        const tableName = process.env.BACKUP_TABLE;

        // Paginate through all users in the Cognito User Pool
        let users = [];
        let paginationToken;
        do {
            const result = await cognito
                .listUsers({
                    UserPoolId: userPoolId,
                    PaginationToken: paginationToken,
                })
                .promise();
            users = users.concat(result.Users);
            paginationToken = result.PaginationToken;
        } while (paginationToken);

        // Write each cognito user to DynamoDB
        for (const user of users) {
            const sub = user.Attributes.find((attr) => attr.Name === 'sub')?.Value;
            const email = user.Attributes.find((attr) => attr.Name === 'email')?.Value;
            const firstName = user.Attributes.find((attr) => attr.Name === 'firstName')?.Value;
            const lastName = user.Attributes.find((attr) => attr.Name === 'lastName')?.Value;

            await docClient.send(
                new PutCommand({
                    TableName: tableName,
                    Item: {
                        sub, // Partition key
                        email,
                        firstName: firstName,
                        lastName: lastName,
                        backupTimestamp: new Date().toISOString(),
                    },
                }),
            );
        }

        console.log(`Backed up ${users.length} users to ${tableName}`);
        return { status: 'success' };
    } catch (err) {
        console.error('Backup error:', err);
        throw new Error(`Failed to back up Cognito User Pool: ${err.message}`);
    }
};
