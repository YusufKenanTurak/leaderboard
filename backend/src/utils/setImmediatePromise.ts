/**
 * A small utility that returns a Promise which resolves on the next
 * iteration of the event loop (similar to setImmediate).
 */
export default function setImmediatePromise(): Promise<void> {
    return new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  