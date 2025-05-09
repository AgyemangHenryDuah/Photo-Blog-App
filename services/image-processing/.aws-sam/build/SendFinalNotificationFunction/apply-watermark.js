const { s3Service } = require("../sub-services/s3Service");
const { getTextBuffer, applyWatermark, streamToBuffer } = require("../Utils/watermarkImage");

exports.handler = async (event) => {
  try {
    const { s3key, body } = event;
    const { firstName, lastName, imageId, userEmail, imageName } = body;
    //get image
    const imageData = await s3Service.uploadFromStaging(s3key);

    //create watermark text
    const uploadDate = new Date(Date.now()).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const fullname = `${firstName} ${lastName}`;
    const watermarkText = `${fullname} - ${uploadDate}`;

    //stream image to buffer
    const streamedImage = await streamToBuffer(imageData);

    //create a watermark buffer
    const textSvg = await getTextBuffer(watermarkText);

    //Apply watermark to image
    const watermarkedImage = await applyWatermark(streamedImage, textSvg);

    //upload to asset bucket
    const outputKey = await s3Service.uploadToAssetBucket(watermarkedImage, s3key);
    const imageUrl = `https://${process.env.ASSET_BUCKET_NAME}.s3.amazonaws.com/${outputKey}`;

    console.log("watermark applied successfully");
    return {
      statusCode: 200,
      body: JSON.stringify({
        imageId,
        userEmail,
        imageUrl,
        imageName,
        stagingLocation: { key: s3key },
        processedLocation: { key: outputKey },
        watermarkApplied: true,
        status: "completed",
        processedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error("Error applying watermark:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Error applying watermark" }),
    };
  }
};
