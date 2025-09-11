export interface SignatureVerifier {
  verify(chain: string, address: string, message: string, signature: string): Promise<boolean>
}
