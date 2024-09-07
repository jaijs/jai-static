import mimeDB from 'mime-db';

interface MimeEntry {
  extensions?: string[];
  mime: string;
  [key: string]: any;  // For other properties in mimeDB entries
}

// Explicitly type mimeDB
const typedMimeDB: Record<string, { extensions?: string[] }> = mimeDB;

const allMimeWithExtension: MimeEntry[] = Object.entries(typedMimeDB)
  .map(([mime, entry]): MimeEntry | undefined => {
    if (entry && entry.extensions) {
      return { ...entry, mime };
    }
    return undefined;
  })
  .filter((x): x is MimeEntry => x !== undefined);

const mimeDBLength = allMimeWithExtension.length;

function mimeWithExtension(extension: string): string {
  for (let i = 0; i < mimeDBLength; i += 1) {
    const entry = allMimeWithExtension[i];
    if (entry && entry.extensions && entry.extensions.includes(extension)) {
      return entry.mime;
    }
  }
  return 'application/octet-stream';
}

export default mimeWithExtension;