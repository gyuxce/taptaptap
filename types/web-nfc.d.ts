interface NDEFReadingEvent extends Event {
  serialNumber: string;
}

interface NDEFReader {
  onreading: ((event: NDEFReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}

declare const NDEFReader: {
  prototype: NDEFReader;
  new(): NDEFReader;
};

interface Window {
  NDEFReader?: typeof NDEFReader;
}
