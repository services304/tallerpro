/*
 * Arranque seguro: si la app no carga, nunca queda una pantalla en blanco.
 * - Si el archivo principal falla (copia vieja guardada, cambio de versión en el servidor, red),
 *   borra la copia guardada y vuelve a intentar una vez sola.
 * - Si vuelve a fallar, dice qué archivo falló y ofrece «Reintentar».
 */
(function () {
  var failed = [];
  var KEY = 'tp-boot-retry';

  function retried() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return true; }
  }

  function hardReload() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    var jobs = [];
    if ('serviceWorker' in navigator) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }).catch(function () {}));
    }
    if (window.caches) {
      jobs.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }).catch(function () {}));
    }
    Promise.all(jobs).then(function () {
      var q = location.search.replace(/([?&])r=\d+&?/g, '$1').replace(/[?&]$/, '');
      location.replace(location.pathname + q + (q ? '&' : '?') + 'r=' + Date.now());
    });
  }

  function showError() {
    if (window.__tallerproMounted) return;
    var box = document.getElementById('boot');
    if (!box) return;
    box.className = 'boot boot-error';
    box.textContent = '';
    var h = document.createElement('p');
    h.textContent = "L'application n'a pas pu démarrer · No se pudo iniciar la app · The app could not start.";
    box.appendChild(h);
    var p = document.createElement('p');
    p.textContent = failed.length ? 'Fichier / archivo / file: ' + failed.join(', ') : 'Rechargez la page · Recarga la página · Reload the page.';
    box.appendChild(p);
    var b = document.createElement('button');
    b.textContent = 'Réessayer · Reintentar · Retry';
    b.style.cssText = 'margin-top:12px;min-height:48px;padding:0 18px;border-radius:10px;border:0;background:#f5b314;color:#111214;font:600 16px system-ui,sans-serif';
    b.onclick = hardReload;
    box.appendChild(b);
  }

  window.addEventListener('error', function (e) {
    var t = e.target;
    var src = t && (t.src || t.href);
    if (src) {
      failed.push(src);
      // El archivo principal de la app no cargó: reintento automático una sola vez.
      if (t.tagName === 'SCRIPT' && /\/assets\/.*\.js/.test(src)) {
        if (!retried()) hardReload();
        else showError();
      }
    } else if (e.filename) {
      failed.push(e.filename + (e.lineno ? ':' + e.lineno : '') + ' — ' + e.message);
    }
  }, true);

  window.addEventListener('load', function () {
    if (window.__tallerproMounted) {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      // Quitar el «?r=…» del reintento de la barra de direcciones.
      if (/[?&]r=\d+/.test(location.search) && history.replaceState) {
        var q = location.search.replace(/([?&])r=\d+&?/, '$1').replace(/[?&]$/, '');
        history.replaceState(null, '', location.pathname + q + location.hash);
      }
    }
  });

  setTimeout(showError, 15000);
})();
