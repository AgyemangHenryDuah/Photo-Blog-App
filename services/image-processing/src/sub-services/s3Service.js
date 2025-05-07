const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../config/aws");

class S3Service {
  bucketName = process.env.BUCKET_NAME;

  async uploadFromStagging() {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key,
    });
    const { body } = await s3Client.send(command);
    return body;
  }

  async uploadToAssetBucket(watermakedImage, key) {
    const outputKey = `watermarked/${key}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: outputKey,
        Body: watermakedImage,
        ContentType: "image/jpeg",
      })
    );
  }

  async deleteFromStagging(key) {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        key,
      })
    );
  }
}

exports.s3Service = new S3Service();
