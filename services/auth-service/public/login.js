(function () {
  var form = document.getElementById('login-form');
  var toggle = document.querySelector('.pw-toggle');
  var pw = document.getElementById('password');
  if (toggle && pw) {
    toggle.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Ocultar' : 'Mostrar';
      toggle.setAttribute('aria-pressed', String(show));
      pw.focus();
    });
  }
  if (form) {
    form.addEventListener('submit', function (e) {
      var email = document.getElementById('email');
      if (!email.value.trim() || !pw.value) {
        e.preventDefault();
        (email.value.trim() ? pw : email).focus();
        (email.value.trim() ? pw : email).setAttribute('aria-invalid', 'true');
        return;
      }
      document.getElementById('submit-btn').classList.add('is-loading');
    });
  }
  document.querySelectorAll('.demo__user').forEach(function (b) {
    b.addEventListener('click', function () {
      document.getElementById('email').value = b.getAttribute('data-email');
      pw.value = b.getAttribute('data-password');
      document.getElementById('submit-btn').focus();
    });
  });
  var auto = document.querySelector('[data-autosubmit]');
  if (auto) {
    var f = document.getElementById(auto.getAttribute('data-autosubmit'));
    if (f) setTimeout(function () { f.submit(); }, 250);
  }
})();
