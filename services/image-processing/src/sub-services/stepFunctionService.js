const { StartExecutionCommand } = require('@aws-sdk/client-sfn');
const { sfnClient } = require('../config/aws');

const stateMachineArn = process.env.STATE_MACHINE_ARN;

class StepFunctionService {
    
    static async startExecution(input, name = undefined) {
        const params = {
            stateMachineArn,
            input: JSON.stringify(input),
        };

        if (name) {
            params.name = name;
        }
        
        const command = new StartExecutionCommand(params);

        try {
            const response = await sfnClient.send(command);
            console.log("Step Function started:", response.executionArn);
            return { status: 'started', executionArn: response.executionArn };
        } catch (err) {
            console.error("Failed to start Step Function", err);
            return { status: 'error', error: err.message || err };
        }
    }
}

module.exports = StepFunctionService;
