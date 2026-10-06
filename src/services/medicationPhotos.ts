import { Directory, File, Paths } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

type PhotoSource = Pick<ImagePickerAsset, 'uri' | 'fileName' | 'mimeType'>;

const PHOTO_FILE_NAME = /^med-\d{13,16}-[0-9a-f]{16}\.(?:jpg|png|webp|heic|heif)$/;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function photoDirectory(): Directory {
  return new Directory(Paths.document, 'medication-photos');
}

function extensionFromName(value: string | null | undefined): string | null {
  if (!value) return null;
  const lastPart = value.split(/[?#]/, 1)[0].split('/').pop() ?? '';
  const extension = /\.([a-z0-9]+)$/i.exec(lastPart)?.[1]?.toLowerCase();
  if (extension === 'jpeg') return 'jpg';
  return extension && ['jpg', 'png', 'webp', 'heic', 'heif'].includes(extension)
    ? extension
    : null;
}

function photoExtension(source: PhotoSource): string {
  return extensionFromName(source.fileName)
    ?? extensionFromName(source.uri)
    ?? MIME_EXTENSIONS[source.mimeType?.toLowerCase() ?? '']
    ?? 'jpg';
}

function randomSuffix(): string {
  const first = Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  const second = Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return first + second;
}

export function isOwnedMedicationPhoto(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const directory = photoDirectory();
  const prefix = directory.uri.endsWith('/') ? directory.uri : `${directory.uri}/`;
  if (!uri.startsWith(prefix)) return false;
  const filename = uri.slice(prefix.length);
  return PHOTO_FILE_NAME.test(filename) && new File(directory, filename).uri === uri;
}

export async function persistMedicationPhoto(source: PhotoSource): Promise<string> {
  const directory = photoDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const extension = photoExtension(source);
  const sourceFile = new File(source.uri);

  for (let attempt = 0; attempt < 5; attempt++) {
    const destination = new File(directory, `med-${Date.now()}-${randomSuffix()}.${extension}`);
    if (destination.exists) continue;
    try {
      await sourceFile.copy(destination, { overwrite: false });
      return destination.uri;
    } catch (error) {
      // A failed copy can leave a partial destination. Never touch the picker source.
      try {
        if (destination.exists) destination.delete();
      } catch (cleanupError) {
        console.warn('Could not clean up incomplete photo copy:', cleanupError);
      }
      throw error;
    }
  }
  throw new Error('Could not allocate a unique medication photo filename.');
}

export function deleteMedicationPhoto(uri: string | null | undefined): boolean {
  if (!uri || !isOwnedMedicationPhoto(uri)) return false;
  const file = new File(uri);
  if (file.exists) file.delete();
  return true;
}
