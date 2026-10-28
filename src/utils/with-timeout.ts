export async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}
