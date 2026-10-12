import { Injectable } from '@angular/core';

/** Browser-only boundary for turning binary application output into a download. */
@Injectable({ providedIn: 'root' })
export class BrowserDownloadService {
  download(bytes: Uint8Array, filename: string, mimeType: string): void {
    const ownedBytes = new Uint8Array(bytes.byteLength);
    ownedBytes.set(bytes);
    const blob = new Blob([ownedBytes.buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
