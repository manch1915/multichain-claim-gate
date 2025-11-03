// Kept free of dependencies so the web app can import it without pulling in crypto code.
export function shortAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 3) return address
  const head = address.startsWith('0x') ? size + 2 : size
  return `${address.slice(0, head)}…${address.slice(-size)}`
}
