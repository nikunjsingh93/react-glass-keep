import hi from './locales/hi.json';
import fr from './locales/fr.json';
export const supportedLanguages=['en','hi','fr'];
export const getLanguage=()=>{try{const value=localStorage.getItem('glass-keep-language');return supportedLanguages.includes(value)?value:'en';}catch{return 'en';}};
export function setLanguage(language) {
  localStorage.setItem('glass-keep-language',supportedLanguages.includes(language)?language:'en');
  document.documentElement.lang=getLanguage();
  window.dispatchEvent(new Event('language-changed'));
}
export function t(text,values={}) {
  const translated=({hi,fr}[getLanguage()]?.[text] || text);
  return translated.replace(/\{(\w+)\}/g,(match,key)=>values[key]===undefined?match:String(values[key]));
}
