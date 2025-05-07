const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../config/aws");

class S3Service {
  constructor() {
    this.bucketName = process.env.BUCKET_NAME;
  }

  async uploadFromStaging(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const { Body } = await s3Client.send(command);
    return Body;
  }

  async uploadToAssetBucket(watermarkedImage, key) {
    const outputKey = `watermarked/${key}`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: outputKey,
      Body: watermarkedImage,
      ContentType: "image/jpeg",
    });
    await s3Client.send(command);
  }

  async deleteFromStaging(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    await s3Client.send(command);
  }
}

module.exports = {
  s3Service: new S3Service(),
};
