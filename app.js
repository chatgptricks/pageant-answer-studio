(() => {
  const titles = { intro:'Intro', answers:'Answers', questions:'Questions', speech:'Speech', outro:'Outro' };
  function navigate() {
    const requested = location.hash.slice(1);
    const view = Object.hasOwn(titles, requested) ? requested : 'answers';
    document.body.dataset.view = view;
    document.getElementById('screenTitle').textContent = titles[view];
    document.querySelectorAll('.bottom-nav a').forEach(link => {
      if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.getElementById('questionBank').open = true;
    document.getElementById('finalSpeeches').hidden = view !== 'speech';
    document.getElementById('showFinalSpeeches').checked = view === 'speech';
    document.getElementById('search').blur();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', navigate);
  navigate();
  let installPrompt;
  const install = document.getElementById('installApp');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; install.hidden = false;
  });
  install.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null; install.hidden = true;
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      document.getElementById('offlineStatus').textContent = 'Ready for offline use on this device';
    }).catch(() => {
      document.getElementById('offlineStatus').textContent = 'Offline setup unavailable, use this page while connected';
    });
  }
})();
