const { s3Service } = require('../sub-services/s3Service');

module.exports.handler = async (event) => { 
    try {
        const { key } = event
        await s3Service.deleteFromStaging(key)

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Image deleted successfully" })
        };    
    } catch (error) {
        console.error("Error in deleteOriginalImage:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" })
        };
    }
}