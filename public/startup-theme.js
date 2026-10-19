// Apply the saved theme before React or its styles load.
(() => {
  let dark=window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  try {
    const saved=localStorage.getItem('glass-keep-dark-mode');
    if(saved!==null)dark=saved==='true';
    const language=localStorage.getItem('glass-keep-language');
    document.documentElement.lang=['hi','fr'].includes(language)?language:'en';
  } catch {}
  document.documentElement.classList.toggle('dark',dark);
})();
