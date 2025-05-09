const sharp = require("sharp");
const { Buffer } = require("buffer");

const getTextBuffer = async (text) => {
  return Buffer.from(
    `<svg width="500" height="80">
        <style>
          .title { fill: white; font-size: 24px; font-weight: bold;}
        </style>
        <text x="10" y="50" class="title">${text}</text>
      </svg>`
  );
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (let chunk of stream) chunks.push(chunk);
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
