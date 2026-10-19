import React from 'react';
import {getLanguage,setLanguage,t} from './i18n';

export default function LanguagePicker() {
  return <label className="settings-card flex items-center justify-between gap-3 mb-4">{t('Language')}
    <select aria-label={t('Language')} value={getLanguage()} onChange={event=>setLanguage(event.target.value)} className="themed-select rounded-lg p-2">
      <option value="en">English</option><option value="hi">हिन्दी</option><option value="fr">Français</option><option value="ru">Русский</option>
    </select>
  </label>;
}
