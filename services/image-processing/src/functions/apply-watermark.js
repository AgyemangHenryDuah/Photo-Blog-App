const { s3Service } = require("../sub-services/s3Service");
const { getTextBuffer, applyWatermark, streamToBuffer } = require("../Utils/watermarkImage");

exports.handler = async (event) => {
  try {
    const { body, key } = event;

    //get image
    const imageData = await s3Service.uploadFromStaging(key);

    //create watermark text
    const uploadDate = new Date(Date.now()).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const fullname = `${userData.firstname} ${userData.lastname}`;
    const watermarkText = `${fullname} - ${uploadDate}`;

    //stream image to buffer
    const streamedImage = await streamToBuffer(imageData);

    //create a watermark buffer
    const textSvg = await getTextBuffer(watermarkText);

    //Apply watermark to image
    const watermarkedImage = await applyWatermark(streamedImage, textSvg);

    //upload to asset bucket
    const outputKey = await s3Service.uploadToAssetBucket(watermarkedImage, key);
    const imageUrl = `https://${process.env.ASSET_BUCKET_NAME}.s3.amazonaws.com/${outputKey}`;

    console.log("watermark applied successfully");
  } catch (error) {
    console.error(error);
    throw new Error("there was an image when applying watermark");
  }
};
