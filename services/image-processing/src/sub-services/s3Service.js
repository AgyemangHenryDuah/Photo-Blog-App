import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
class S3Service {
  bucketName = process.env.BUCKET_NAME;

  async uploadFromStagging() {
    const command = new GetObjectCommand({
      Bucket: "XXXXXX",
      Key: "key",
    });
    const { body } = await s3.send(command);
    return body;
  }

  async uploadToAssetBucket(watermakedImage, key) {
    const outputKey = `watermarked/${key}`;
    await s3.send(
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
        Key: key,
      })
    );
  }
}

export const s3Service = new S3Service();
