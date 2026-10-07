/* Si la app no arranca, mostrar qué archivo falló en vez de una pantalla en blanco. */
(function () {
  var failed = [];
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && (t.src || t.href)) failed.push(t.src || t.href);
    else if (e.filename) failed.push(e.filename + (e.lineno ? ':' + e.lineno : '') + ' — ' + e.message);
  }, true);
  setTimeout(function () {
    if (window.__tallerproMounted) return;
    var box = document.getElementById('boot');
    if (!box) return;
    box.className = 'boot boot-error';
    box.textContent = '';
    var h = document.createElement('p');
    h.textContent = "TallerPro n'a pas pu démarrer · No se pudo iniciar TallerPro · TallerPro could not start.";
    box.appendChild(h);
    var p = document.createElement('p');
    p.textContent = failed.length ? 'Fichier / archivo / file: ' + failed.join(', ') : 'Rechargez la page · Recarga la página · Reload the page.';
    box.appendChild(p);
  }, 10000);
})();
