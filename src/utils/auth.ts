export function basicAuth(user: string, key: string): string {
  return Buffer.from(`${user}:${key}`).toString('base64');
}
