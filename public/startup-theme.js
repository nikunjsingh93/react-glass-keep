// Apply the saved theme before React or its styles load.
(() => {
  let dark=window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  try {
    const saved=localStorage.getItem('glass-keep-dark-mode');
    if(saved!==null)dark=saved==='true';
    document.documentElement.lang=localStorage.getItem('glass-keep-language')==='hi'?'hi':'en';
  } catch {}
  document.documentElement.classList.toggle('dark',dark);
})();
