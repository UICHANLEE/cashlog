export const resolveServerStorageSignedUrl = (baseUrl: string, signedUrl: string) => {
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl
  const path = signedUrl.startsWith('/') ? signedUrl : `/${signedUrl}`
  if (path.startsWith('/storage/v1/')) return `${baseUrl}${path}`
  return `${baseUrl}/storage/v1${path}`
}
