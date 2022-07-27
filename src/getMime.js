const mimeDB = require('mime-db');

const allMimeWithExtension = Object.keys(mimeDB).map((x) => {
  if (mimeDB[x].extensions) {
    return { ...mimeDB[x], mime: x };
  }
  return undefined;
}).filter((x) => x);

const mimeDBLength = allMimeWithExtension.length;
function mimeWithExtension(extension) {
  for (let i = 0; i < mimeDBLength; i += 1) {
    if (allMimeWithExtension[i].extensions.includes(extension)) {
      return allMimeWithExtension[i].mime;
    }
  }
  return 'application/octet-stream';
}
module.exports = mimeWithExtension;
