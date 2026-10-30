import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { secretPath } from './paths'

export const AI_API_KEY_SECRET = 'ai-api-key'

export function saveSecret(name: string, value: string): void {
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value)
    : Buffer.from(value, 'utf8')
  writeFileSync(secretPath(name), payload)
}

export function loadSecret(name: string): string | null {
  const path = secretPath(name)
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

export function deleteSecret(name: string): void {
  const path = secretPath(name)
  if (existsSync(path)) unlinkSync(path)
}

export function hasSecret(name: string): boolean {
  return existsSync(secretPath(name))
}

export function saveToken(accountId: string, token: string): void {
  saveSecret(accountId, token)
}

export function loadToken(accountId: string): string | null {
  return loadSecret(accountId)
}

export function deleteToken(accountId: string): void {
  deleteSecret(accountId)
}

export function saveAiApiKey(key: string): void {
  saveSecret(AI_API_KEY_SECRET, key.trim())
}

export function loadAiApiKey(): string | null {
  return loadSecret(AI_API_KEY_SECRET)
}

export function deleteAiApiKey(): void {
  deleteSecret(AI_API_KEY_SECRET)
}

export function hasAiApiKey(): boolean {
  return hasSecret(AI_API_KEY_SECRET)
}
