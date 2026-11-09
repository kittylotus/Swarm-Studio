const DATABASE = "swarm-studio-assets-v1";
const STORE = "identity-avatars";
let database: Promise<IDBDatabase> | undefined;
const urls = new Map<string, string>();

function openDatabase(): Promise<IDBDatabase> {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error ?? new Error("Avatar storage is unavailable."));
    request.onblocked = () => reject(new Error("Close other Studio tabs to upgrade avatar storage, then retry."));
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  }).catch(error => { database = undefined; throw error; });
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error("Could not save the identity picture."));
  });
}

export async function identityThumbnail(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale === 1 && file.type === "image/webp" && file.size <= 256_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the identity picture.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode the identity picture.")), "image/webp", .82));
  } finally { URL.revokeObjectURL(url); }
}

export async function storeAvatar(key: string, source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) throw new Error("Could not read the identity picture.");
  const blob = await identityThumbnail(await response.blob());
  await transaction("readwrite", store => store.put(blob, key));
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

export async function loadAvatar(key: string): Promise<string> {
  const cached = urls.get(key);
  if (cached) return cached;
  const blob = await transaction<Blob | undefined>("readonly", store => store.get(key));
  if (!(blob instanceof Blob)) throw new Error("A saved identity picture is missing from this browser's storage. Choose its picture again.");
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

export async function deleteAvatar(key: string): Promise<void> {
  await transaction("readwrite", store => store.delete(key));
  const url = urls.get(key);
  if (url) URL.revokeObjectURL(url);
  urls.delete(key);
}
