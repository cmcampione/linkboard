import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkNfcService } from './link-nfc.service';

const storageKey = 'linkboard.nfc-associations';
const recordType = 'application/vnd.linkboard.tag';
let writeFailure: Error | undefined;

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
  let reader: MockNDEFReader;
  let originalSecureContext: PropertyDescriptor | undefined;
  let originalReader: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorage.clear();
    writeFailure = undefined;
    reader = new MockNDEFReader();
    originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    originalReader = Object.getOwnPropertyDescriptor(window, 'NDEFReader');
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(window, 'NDEFReader', {
      configurable: true,
      value: class extends MockNDEFReader {
        constructor() {
          super();
          reader = this;
        }
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
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

  it('writes a Linkboard tag and stores its link association', async () => {
    const service = new LinkNfcService();

    await service.associateLink('link-1');

    const [message, options] = reader.write.mock.calls[0];
    expect(message.records[0]).toMatchObject({
      recordType: 'mime',
      mediaType: recordType,
    });
    expect(options.overwrite).toBe(false);
    expect(typeof message.records[0].data).not.toBe('string');
    expect(new TextDecoder().decode(message.records[0].data as Uint8Array)).toBe(service.associations()[0].token);
    expect(service.associations()[0].linkId).toBe('link-1');
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toEqual(service.associations());
  });

  it('removes the pending association when writing the tag fails', async () => {
    const writeError = new Error('Tag non disponibile');
    const service = new LinkNfcService();
    writeFailure = writeError;

    await expect(service.associateLink('link-1')).rejects.toBe(writeError);

    expect(service.associations()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toEqual([]);
  });

  it('calls a link once for repeated readings and ignores unknown tags', async () => {
    const token = 'tag-token';
    localStorage.setItem(storageKey, JSON.stringify([{ token, linkId: 'link-1' }]));
    const service = new LinkNfcService();
    const onLinkRead = vi.fn();
    const onUnknownTag = vi.fn();
    const stop = await service.startScanning(onLinkRead, onUnknownTag, vi.fn());
    const message = {
      records: [
        {
          mediaType: recordType,
          data: new DataView(new TextEncoder().encode(token).buffer),
        },
      ],
    };

    reader.dispatchEvent(readingEvent(message));
    reader.dispatchEvent(readingEvent(message));
    reader.dispatchEvent(readingEvent({ records: [] }));

    expect(onLinkRead).toHaveBeenCalledTimes(1);
    expect(onLinkRead).toHaveBeenCalledWith('link-1');
    expect(onUnknownTag).toHaveBeenCalledTimes(1);
    stop();
    expect(reader.scan.mock.calls[0][0].signal.aborted).toBe(true);
  });
});

function readingEvent(message: { records: { mediaType?: string; data: DataView | null }[] }): Event {
  const event = new Event('reading');
  Object.defineProperty(event, 'message', { value: message });
  return event;
}
