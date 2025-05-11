
/**
 * Creates a standardized API response object
 * 
 * @param {number} statusCode - HTTP status code
 * @param {object|string} body - Response body (will be stringified if object)
 * @param {object} [headers={}] - Optional response headers
 * @param {boolean} [isBase64Encoded=false] - Whether the body is Base64 encoded
 * @returns {object} - API Gateway response object
 */

const createResponse = (statusCode, body, headers = {}, isBase64Encoded = false) => {
  // Set standard headers
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // Adjust for production
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
    ...headers
  };

  return {
    statusCode,
    headers: responseHeaders,
    body: typeof body === 'object' ? JSON.stringify(body) : body,
    isBase64Encoded
  };
};



/**
 * Parses and validates request body
 * 
 * @param {object} event - API Gateway event
 * @returns {object} - Parsed body
 * @throws {Error} - If body is invalid
 */

const parseBody = (event) => {
    try {
      if (!event.body) {
        return {};
      }
      
      return event.isBase64Encoded
        ? JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'))
        : JSON.parse(event.body);
    } catch (error) {
      throw new Error('Invalid request body');
    }
  };
  


  /**
   * Error handler for Lambda functions
   * 
   * @param {Error} error - Error object
   * @param {customError} customError - Custom Error message
   * @returns {object} - API Gateway response
   */

  const handleError = (error, customError) => {
    console.error('Error:', error);
    
    // Determine status code based on error
    let statusCode = 500;
    let message = 'Internal server error';
    
    if (error.message.includes('Invalid') || error.message.includes('required')) {
      statusCode = 400;
      message = error.message;
    } else if (
      error.message.includes('Unauthorized') || 
      error.message.includes('Token') ||
      error.message.includes('permission') ||
      error.message.includes('Authentication')
    ) {
      statusCode = 401;
      message = error.message;
    } else if (error.message.includes('Not found')) {
      statusCode = 404;
      message = error.message;
    } else if (error.message.includes('Conflict')) {
      statusCode = 409;
      message = error.message;
    } else {
      statusCode = 500;
      message = error.message;
    }
    
    return createResponse(statusCode, { error: customError || 'An error occurred!', details: message });
  };

  
  module.exports = {
    createResponse,
    parseBody,
    handleError
  }