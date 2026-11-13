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

/* Virtual keyboard uses the active input, not the DOM text contents.
   This avoids depending on Windows OSK when native kiosk mode covers the taskbar. */
let activePassword=document.getElementById('password');
let language='en';
let upper=false;
const rows=document.getElementById('keyboard-rows');
const layoutKey=document.getElementById('change-layout');
const caseKey=document.getElementById('change-case');
const board={
  en:['1234567890','qwertyuiop','asdfghjkl','zxcvbnm','!@#$%&*_-+=.'],
  ru:['1234567890','йцукенгшщзхъ','фывапролджэ','ячсмитьбю','!@#$%&*_-+=.'],
};
for(const id of ['password','confirm'])document.getElementById(id).addEventListener('focus',event=>{
  activePassword=event.target;
});
function insertKey(value){
  const input=activePassword;
  if(!input || input.value.length>=128)return;
  const start=input.selectionStart??input.value.length;
  const end=input.selectionEnd??start;
  input.setRangeText(value,start,end,'end');
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function changeInput(key){
  const input=activePassword;
  if(!input)return;
  if(key==='space')insertKey(' ');
  else if(key==='clear'){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}
  else if(key==='backspace'){
    const start=input.selectionStart??input.value.length;
    const end=input.selectionEnd??start;
    if(start===end && start>0)input.setRangeText('',start-1,end,'end');
    else input.setRangeText('',start,end,'end');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }else insertKey(upper?key.toUpperCase():key);
}
function render(){
  rows.replaceChildren();
  for(const line of board[language]){
    const row=document.createElement('div');
    row.className='touch-keyboard-row';
    for(const char of [...line]){
      const key=document.createElement('button');
      key.type='button';key.textContent=upper?char.toUpperCase():char;
      key.addEventListener('click',()=>changeInput(char));
      row.appendChild(key);
    }
    rows.appendChild(row);
  }
  caseKey.setAttribute('aria-pressed',String(upper));
}
layoutKey.addEventListener('click',()=>{language=language==='en'?'ru':'en';render();});
caseKey.addEventListener('click',()=>{upper=!upper;render();});
document.querySelectorAll('[data-key]').forEach(button=>button.addEventListener('click',()=>changeInput(button.dataset.key)));
render();
