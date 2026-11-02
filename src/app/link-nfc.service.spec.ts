import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkNfcService } from './link-nfc.service';

const recordType = 'application/vnd.linkboard.tag';
let writeFailure: Error | undefined;
let readers: MockNDEFReader[];

class MockNDEFReader extends EventTarget {
  scan = vi.fn(async (_options: { signal: AbortSignal }) => {});
  write = vi.fn(
    async (
      _message: {
        records: { recordType: 'mime'; mediaType: string; data: ArrayBuffer | ArrayBufferView }[];
      },
      _options: { overwrite: boolean },
    ) => {
      if (writeFailure) throw writeFailure;
    },
  );
}

describe('LinkNfcService', () => {
  let originalSecureContext: PropertyDescriptor | undefined;
  let originalReader: PropertyDescriptor | undefined;

  beforeEach(() => {
    writeFailure = undefined;
    readers = [];
    originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    originalReader = Object.getOwnPropertyDescriptor(window, 'NDEFReader');
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(window, 'NDEFReader', {
      configurable: true,
      value: class extends MockNDEFReader {
        constructor() {
          super();
          readers.push(this);
        }
      },
    });
  });

  afterEach(() => {
    if (originalSecureContext) {
      Object.defineProperty(window, 'isSecureContext', originalSecureContext);
    } else {
      Reflect.deleteProperty(window, 'isSecureContext');
    }
    if (originalReader) {
      Object.defineProperty(window, 'NDEFReader', originalReader);
    } else {
      Reflect.deleteProperty(window, 'NDEFReader');
    }
  });

  it('writes the link ID directly so multiple tags can target the same link', async () => {
    const service = new LinkNfcService();

    await service.associateLink('link-1');
    await service.associateLink('link-1');

    expect(readers).toHaveLength(2);
    for (const reader of readers) {
      const [message, options] = reader.write.mock.calls[0];
      expect(message.records[0]).toMatchObject({
        recordType: 'mime',
        mediaType: recordType,
      });
      expect(options.overwrite).toBe(true);
      expect(new TextDecoder().decode(message.records[0].data as Uint8Array)).toBe('link-1');
    }
  });

  it('reports an NFC write failure', async () => {
    const writeError = new Error('Tag non disponibile');
    const service = new LinkNfcService();
    writeFailure = writeError;

    await expect(service.associateLink('link-1')).rejects.toBe(writeError);
  });

  it('reads link IDs directly and ignores repeated or unknown tags', async () => {
    const service = new LinkNfcService();
    const onLinkRead = vi.fn();
    const onUnknownTag = vi.fn();
    const stop = await service.startScanning(onLinkRead, onUnknownTag, vi.fn());
    const reader = readers[0];
    reader.dispatchEvent(readingEvent('link-1'));
    reader.dispatchEvent(readingEvent('link-1'));
    reader.dispatchEvent(readingEvent(''));

    expect(onLinkRead).toHaveBeenCalledTimes(1);
    expect(onLinkRead).toHaveBeenCalledWith('link-1');
    expect(onUnknownTag).toHaveBeenCalledTimes(1);
    stop();
    expect(reader.scan.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it('resolves separate tags with the same link ID in separate scans', async () => {
    const service = new LinkNfcService();
    const firstRead = vi.fn();
    const firstStop = await service.startScanning(firstRead, vi.fn(), vi.fn());
    readers[0].dispatchEvent(readingEvent('link-1'));
    firstStop();

    const secondRead = vi.fn();
    const secondStop = await service.startScanning(secondRead, vi.fn(), vi.fn());
    readers[1].dispatchEvent(readingEvent('link-1'));
    secondStop();

    expect(firstRead).toHaveBeenCalledWith('link-1');
    expect(secondRead).toHaveBeenCalledWith('link-1');
  });
});

function readingEvent(linkId: string): Event {
  const event = new Event('reading');
  Object.defineProperty(event, 'message', {
    value: {
      records: linkId ? [{ mediaType: recordType, data: new DataView(new TextEncoder().encode(linkId).buffer) }] : [],
    },
  });
  return event;
}
