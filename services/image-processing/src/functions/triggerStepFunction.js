const StepFunctionService = require('../sub-services/stepFunctionService');

exports.handler = async (event) => {
    const results = [];

    for (const record of event.Records) {
        try {
            const s3Info = record.s3
            const stagingBucket = s3Info.bucket.name;
            const key = decodeURIComponent(s3Info.object.key.replace(/\+/g, ' '));


            const photoId = key.split('/').pop().split('.')[0];

            const input = {
                stagingBucket: stagingBucket,
                s3key: key,
                photoId: photoId,
                uploadedAt: record.eventTime
            };

            const result = await StepFunctionService.startExecution(input)
            
        } catch (err) {
            console.error('Error processing record:', err);
        }
    }
    return {
        statusCode: 200,
        body: JSON.stringify(results)
    }
};
