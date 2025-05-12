const sharp = require("sharp");
const { Buffer } = require("buffer");

const getTextBuffer = async (text) => {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="80">
      <style>
        .title { 
          fill: rgb(255, 255, 255); 
          font-size: 30px;
          font-weight: bold;
          font-family: Arial, sans-serif;
          text-anchor: middle;
          dominant-baseline: middle;
        }
      </style>
      <text x="250" y="40" class="title">${text}</text>
    </svg>`
  );
};

const streamToBuffer = async (stream) => {
  // If it's already a buffer, return it directly
  if (Buffer.isBuffer(streamOrBuffer)) {
    return streamOrBuffer;
  }
  
  // Otherwise process as stream
  const chunks = [];
  for await (let chunk of streamOrBuffer) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const applyWatermark = async (imageBuffer, textSvg) => {
  return await sharp(imageBuffer)
    .composite([{ input: textSvg, gravity: "southeast" }])
    .jpeg()
    .toBuffer();
};

module.exports = {
  getTextBuffer,
  streamToBuffer,
  applyWatermark,
};
