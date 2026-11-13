// desktop/first-run.js — first-run password is passed only to the restricted local IPC handler.
'use strict';
const form = document.getElementById('form');
const error = document.getElementById('error');
const button = document.getElementById('submit');
form.addEventListener('submit', async event => {
  event.preventDefault();
  error.textContent = '';
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;
  if (password.length < 12 || password.length > 128) {
    error.textContent = 'Пароль должен содержать от 12 до 128 символов'; return;
  }
  if (password !== confirm) {
    error.textContent = 'Пароли не совпадают'; return;
  }
  button.disabled = true;
  try {
    if (!window.navikulturaDesktop?.setupAdmin) throw Error('Нет связи с приложением');
    const response = await window.navikulturaDesktop.setupAdmin(password);
    if (!response?.ok) throw Error(response?.message || 'Ошибка настройки');
    form.reset();
    button.textContent = 'Открывается экран посетителя…';
  } catch (err) {
    error.textContent = err.message || 'Не удалось сохранить пароль';
    button.disabled = false;
  }
});
