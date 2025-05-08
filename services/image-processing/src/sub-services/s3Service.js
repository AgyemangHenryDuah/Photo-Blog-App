const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../config/aws");

const STAGING_BUCKET_NAME = process.env.STAGING_BUCKET_NAME;
const ASSET_BUCKET_NAME = process.env.ASSET_BUCKET_NAME;

class S3Service {
  async uploadFromStaging(key) {
    const command = new GetObjectCommand({
      Bucket: STAGING_BUCKET_NAME,
      Key: key,
    });
    const { Body } = await s3Client.send(command);
    return Body;
  }

  async uploadToAssetBucket(watermarkedImage, key) {
    const outputKey = `watermarked/${key}`;
    const command = new PutObjectCommand({
      Bucket: ASSET_BUCKET_NAME,
      Key: outputKey,
      Body: watermarkedImage,
      ContentType: "image/jpeg",
    });
    await s3Client.send(command);
  }

  async deleteFromStaging(key) {
    const command = new DeleteObjectCommand({
      Bucket: STAGING_BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
  }
}

module.exports = {
  s3Service: new S3Service(),
};
