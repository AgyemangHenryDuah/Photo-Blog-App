// Get user email from database


//Generate email subject


//Send email to user

const emailService = require('../../services/emailService');
const processingService = require('../../services/processingService');

exports.handler = async (event) => {
    try {
        const { imageId, errorMessage } = JSON.parse(event.body);
        
        // Get user email from DynamoDB
        const userEmail = await processingService.getUserEmail(imageId);
        
        if (!userEmail) {
            throw new Error('User email not found for image: ' + imageId);
        }
        
        // Send processing failed email
        await emailService.sendEmail(
            userEmail,
            'processing_failed',
            {
                imageId,
                errorMessage,
                failureTime: new Date().toISOString()
            }
        );
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Processing failed email sent' })
        };
    } catch (error) {
        console.error('Error in processingFailed:', error);
        throw error;
    }
};