import { loadTranslations } from '@angular/localize';
import { LANGUAGE } from './app/core/i18n/language';

// Translations must be loaded before any module that uses $localize is evaluated, so the app is imported after.
async function start(): Promise<void> {
  document.documentElement.lang = LANGUAGE;
  if (LANGUAGE === 'cs') {
    const { default: messages } = await import('./locale/messages.cs.json');
    loadTranslations(messages.translations);
  }
  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
}

start().catch((err: unknown) => console.error(err));
