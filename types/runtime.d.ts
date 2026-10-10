export {}

// The hooks runtime has these (the engine's own docs use them); TypeScript 5.9's lib does not yet.
declare global {
  interface Uint8Array<_TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {
    toBase64(): string
  }
  interface Uint8ArrayConstructor {
    fromBase64(base64: string): Uint8Array<ArrayBuffer>
  }
}
