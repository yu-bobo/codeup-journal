import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { secretPath } from './paths'

export function saveToken(accountId: string, token: string): void {
  const buf = Buffer.from(token, 'utf8')
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token)
    : buf
  writeFileSync(secretPath(accountId), payload)
}

export function loadToken(accountId: string): string | null {
  const path = secretPath(accountId)
  if (!existsSync(path)) return null
  const raw = readFileSync(path)
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw)
    }
    return raw.toString('utf8')
  } catch {
    return null
  }
}

export function deleteToken(accountId: string): void {
  const path = secretPath(accountId)
  if (existsSync(path)) unlinkSync(path)
}
