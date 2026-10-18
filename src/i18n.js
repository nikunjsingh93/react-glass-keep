import hi from './locales/hi.json';
export const getLanguage=()=>{try{return localStorage.getItem('glass-keep-language') || 'en';}catch{return 'en';}};
export function setLanguage(language) {
  localStorage.setItem('glass-keep-language',language==='hi'?'hi':'en');
  document.documentElement.lang=getLanguage();
  window.dispatchEvent(new Event('language-changed'));
}
export function t(text,values={}) {
  const translated=getLanguage()==='hi'?(hi[text] || text):text;
  return translated.replace(/\{(\w+)\}/g,(match,key)=>values[key]===undefined?match:String(values[key]));
}
