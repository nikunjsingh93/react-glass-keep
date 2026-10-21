import hi from './locales/hi.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import ru from './locales/ru.json';
export const supportedLanguages=['en','de','hi','fr','ru'];
export const getLanguage=()=>{try{const value=localStorage.getItem('glass-keep-language');return supportedLanguages.includes(value)?value:'en';}catch{return 'en';}};
export function setLanguage(language) {
  localStorage.setItem('glass-keep-language',supportedLanguages.includes(language)?language:'en');
  document.documentElement.lang=getLanguage();
  window.dispatchEvent(new Event('language-changed'));
}
export function t(text,values={}) {
  const translated=({hi,de,fr,ru}[getLanguage()]?.[text] || text);
  return translated.replace(/\{(\w+)\}/g,(match,key)=>values[key]===undefined?match:String(values[key]));
}
