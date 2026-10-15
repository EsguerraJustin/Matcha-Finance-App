/**
 * Receipt photos — capture or pick, compress, store locally.
 *
 * Only the **relative path** is written to SQLite (brief Section 6.6). Files
 * live in the app's private directory and are deleted when their expense is
 * purged. Nothing here touches the network.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { newId } from './id';

/** Longest edge after compression — keeps a receipt readable, not a 12 MP file. */
export const RECEIPT_MAX_DIMENSION = 1280;
export const RECEIPT_QUALITY = 0.7;

const RECEIPTS_DIRNAME = 'receipts';

function receiptsDirectory(): Directory | null {
  try {
    const dir = new Directory(Paths.document, RECEIPTS_DIRNAME);
    if (!dir.exists) dir.create({ intermediates: true });
    return dir;
  } catch {
    // A device with no writable document directory still runs the app; it just
    // cannot store receipts.
    return null;
  }
}

/** `receipts/<uuid>.jpg` — relative on purpose, so the DB stays portable. */
export function receiptRelativePath(fileName: string): string {
  return `${RECEIPTS_DIRNAME}/${fileName}`;
}

export function receiptFile(relativePath: string): File {
  return new File(Paths.document, relativePath);
}

export function receiptExists(relativePath: string | null): boolean {
  if (!relativePath) return false;
  try {
    return receiptFile(relativePath).exists;
  } catch {
    return false;
  }
}

export function deleteReceipt(relativePath: string | null): void {
  if (!relativePath) return;
  try {
    const file = receiptFile(relativePath);
    if (file.exists) file.delete();
  } catch {
    // A missing file is the desired end state anyway.
  }
}

/**
 * Compress into the app's private receipts folder and return the relative path.
 * `manipulateAsync` writes the compressed JPEG to the cache directory, so it
 * is then moved into place.
 */
async function persistImage(sourceUri: string): Promise<string | null> {
  const dir = receiptsDirectory();
  if (!dir) return null;

  const compressed = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: RECEIPT_MAX_DIMENSION } }],
    { compress: RECEIPT_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  const fileName = `${newId()}.jpg`;
  const destination = new File(dir, fileName);
  await new File(compressed.uri).copy(destination, { overwrite: true });

  return receiptRelativePath(fileName);
}

export interface ReceiptResult {
  relativePath: string;
  previewUri: string;
  width: number;
  height: number;
}

async function toResult(asset: ImagePicker.ImagePickerAsset): Promise<ReceiptResult | null> {
  const relativePath = await persistImage(asset.uri);
  if (!relativePath) return null;
  return {
    relativePath,
    previewUri: receiptFile(relativePath).uri,
    width: asset.width,
    height: asset.height,
  };
}

/** Opens the camera. */
export async function captureReceipt(): Promise<ReceiptResult | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: RECEIPT_QUALITY,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return toResult(result.assets[0]);
}

/** Opens the photo library. */
export async function pickReceipt(): Promise<ReceiptResult | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: RECEIPT_QUALITY,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return toResult(result.assets[0]);
}

/** Only used by the "erase all data" flow in Phase 5. */
export function deleteAllReceipts(): void {
  const dir = receiptsDirectory();
  if (!dir) return;
  try {
    for (const entry of dir.list()) {
      if (entry instanceof File) entry.delete();
    }
  } catch {
    // Best effort.
  }
}