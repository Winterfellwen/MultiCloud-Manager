export function createSSEStream(iterator: AsyncIterable<any>): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      for await (const event of iterator) {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      }
      controller.close();
    }
  });
}