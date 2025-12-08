'use client';

import { AuthTokens } from './types';

const KEY = 'rubypets-auth';

export function loadTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: AuthTokens) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}
