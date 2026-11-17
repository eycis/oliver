// Pixel-art shortcut icons. Render the same rectangles to SVG and lossless PNG.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const background = "#f8c9d8";
const rects = [];
const rect = (x, y, w, h, color) => rects.push({ x, y, w, h, color });
const rows = [
  "..####....####..",
  ".######..######.",
  "################",
  "################",
  "################",
  "################",
  ".##############.",
  "..############..",
  "...##########...",
  "....########....",
  ".....######.....",
  "......####......",
  ".......##.......",
];
for (let y = 0; y < rows.length; y++)
  for (let x = 0; x < 16; x++)
    if (rows[y][x] === "#") rect(x + 8, y + 11, 1, 1, "#dfa0b7");
for (let y = 0; y < rows.length; y++)
  for (let x = 0; x < 16; x++)
    if (rows[y][x] === "#") {
      const edge = !rows[y - 1]?.[x] || rows[y - 1]?.[x] !== "#"
        || rows[y + 1]?.[x] !== "#" || rows[y][x - 1] !== "#" || rows[y][x + 1] !== "#";
      rect(x + 8, y + 9, 1, 1, edge ? "#ad4f72" : y > 7 ? "#df789c" : "#ee98b5");
    }
rect(11, 11, 3, 1, "#fff3f8");
rect(10, 12, 2, 2, "#fff3f8");
for (const [x,y] of [[6,8],[25,20]]) {
  rect(x, y-1, 1, 3, "#fff3f8");
  rect(x-1, y, 3, 1, "#fff3f8");
}
rect(23, 6, 1, 1, "#fff3f8");
rect(8, 25, 1, 1, "#fff3f8");
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">'
  + '<rect width="32" height="32" fill="'+background+'"/>'
  + rects.map(r => '<rect x="'+r.x+'" y="'+r.y+'" width="'+r.w+'" height="'+r.h+'" fill="'+r.color+'"/>').join("") + '</svg>';
writeFileSync("public/shortcut-heart.svg", svg + "\n");
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i=0;i<8;i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([size,name,data,crc]);
}
const rgb = color => Buffer.from(color.slice(1), "hex");
for (const size of [192,512]) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const px=Math.floor(x*32/size), py=Math.floor(y*32/size);
    let color=background;
    for (const r of rects)
      if(px>=r.x && px<r.x+r.w && py>=r.y && py<r.y+r.h) color=r.color;
    rgb(color).copy(raw,y*(size*3+1)+1+x*3);
  }
  const header=Buffer.alloc(13);
  header.writeUInt32BE(size,0); header.writeUInt32BE(size,4);
  header[8]=8; header[9]=2;
  writeFileSync("public/shortcut-heart-"+size+".png", Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR",header),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0)),
  ]));
}
