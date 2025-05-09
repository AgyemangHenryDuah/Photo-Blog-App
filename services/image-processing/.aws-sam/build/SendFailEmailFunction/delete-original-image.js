const { s3Service } = require("../sub-services/s3Service");

exports.handler = async (event) => {
  const { imageInfo } = event.body;
  const { s3key } = imageInfo;

  try {
    await s3Service.deleteFromStaging(s3key);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Image deleted" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Image not deleted" }),
    };
  }
};
