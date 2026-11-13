<!-- apps/web/src/components/TicketWidget.vue — approved Muzaticket iframe and local Windows OSK button. -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ url: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const DEFAULT = 'https://muzaticket.ru/iframe/organizations/organization-mau-gdk-kirovskii-448753';
const WINDOWS_KEYBOARD_BRIDGE = 'http://127.0.0.1:48765/keyboard';

function approved(value: string): string | null {
  try {
    const url = new URL(value || DEFAULT);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!['muzaticket.ru', 'widget.muzaticket.ru'].includes(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch { return null; }
}

const widgetUrl = computed(() => approved(props.url));
const busy = ref(true);
const keyboardHelp = ref(false);
const keyboardStarting = ref(false);
const keyboardMessage = ref('');
let keyboardAbort: AbortController | null = null;

async function showWindowsKeyboard() {
  if (keyboardStarting.value) return;
  keyboardStarting.value = true;
  keyboardHelp.value = false;
  keyboardMessage.value = '';
  // The packaged Electron app owns the Windows session. Invoke OSK directly
  // through a narrow, main-frame-only IPC bridge; no localhost helper needed.
  const desktop = (window as Window & {
    navikulturaDesktop?: {showKeyboard:()=>Promise<{ok:boolean;message?:string}>}
  }).navikulturaDesktop;
  if (desktop?.showKeyboard) {
    try {
      const result=await desktop.showKeyboard();
      if(!result.ok)throw Error(result.message||'Windows не запустила экранную клавиатуру');
      keyboardMessage.value='Системная клавиатура вызвана. Коснитесь поля в билетной форме.';
    } catch(error) {
      keyboardMessage.value=error instanceof Error?error.message:'Не удалось запустить клавиатуру Windows';
      keyboardHelp.value=true;
    } finally { keyboardStarting.value=false; }
    return;
  }
  const controller = new AbortController();
  keyboardAbort = controller;
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    // No code runs on the central server. This endpoint must be provided by the
    // loopback-only helper running in the Windows session of the kiosk itself.
    // Newer Edge/Chromium may require a loopback-network site permission.
    // targetAddressSpace also marks this HTTP loopback fetch as an intentional
    // local-device request from an HTTPS page.
    const requestOptions: RequestInit & { targetAddressSpace: 'loopback' } = {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'X-Navikultura-Keyboard': 'show' },
      signal: controller.signal,
      targetAddressSpace: 'loopback',
    };
    const response = await fetch(WINDOWS_KEYBOARD_BRIDGE, requestOptions);
    if (!response.ok) {
      const data: { message?: string } = await response.json().catch(() => ({}));
      const reason = data.message;
      if (response.status === 403) throw new Error('Мост запущен, но адрес этого сайта не разрешён. Проверьте NAVIKULTURA_KIOSK_ORIGIN.');
      if (reason === 'windows-only') throw new Error('Компонент должен работать на компьютере с Windows.');
      if (reason === 'keyboard-launch-failed') throw new Error('Локальный компонент отвечает, но Windows не запустила osk.exe.');
      throw new Error('Локальный компонент отклонил запрос (HTTP ' + response.status + ').');
    }
    keyboardMessage.value = 'Windows приняла запрос на запуск клавиатуры. Коснитесь поля в билетной форме.';
  } catch (error) {
    keyboardMessage.value = error instanceof Error && error.message !== 'Failed to fetch' && error.name !== 'AbortError'
      ? error.message
      : 'Нет соединения с локальным мостом или Edge запретил доступ к 127.0.0.1. Проверьте разрешение «Доступ к локальной сети» для адреса НавиКультуры.';
    keyboardHelp.value = true;
  } finally {
    window.clearTimeout(timeout);
    if (keyboardAbort === controller) keyboardAbort = null;
    keyboardStarting.value = false;
  }
}

function esc(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close'); }
}
onMounted(() => document.addEventListener('keydown', esc, true));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', esc, true);
  keyboardAbort?.abort();
});
</script>
<template>
  <div class="kiosk-ticket-scrim" role="presentation">
    <section class="kiosk-ticket-modal" role="dialog" aria-modal="true" aria-label="Покупка билета Muzaticket">
      <header class="kiosk-ticket-header">
        <div><span>НАВИКУЛЬТУРА · БИЛЕТНАЯ КАССА</span>
          <h2>Билеты на мероприятие</h2></div>
        <div class="kiosk-ticket-header-actions">
          <button type="button" class="kiosk-ticket-keyboard" :disabled="keyboardStarting"
            aria-label="Вызвать экранную клавиатуру Windows" @click="showWindowsKeyboard">
            ⌨ <span>{{ keyboardStarting ? 'Запуск…' : 'Клавиатура Windows' }}</span>
          </button>
          <button type="button" class="kiosk-ticket-close" autofocus @click="emit('close')">✕ <span>Вернуться в НавиКультуру</span></button>
        </div>
      </header>
      <div v-if="widgetUrl" class="kiosk-ticket-content">
        <iframe :src="widgetUrl" title="Виджет покупки билетов Muzaticket"
          sandbox="allow-scripts allow-forms allow-same-origin"
          allow="payment" referrerpolicy="no-referrer-when-downgrade"
          loading="eager" @load="busy=false"></iframe>
        <p v-if="busy" class="kiosk-ticket-wait" role="status">Загружается билетная система…</p>
        <div v-if="keyboardHelp" class="kiosk-ticket-keyboard-help" role="alert">
          <strong>{{ keyboardMessage }}</strong>
          <p>Нажмите на поле ввода Muzaticket: при включённом автоматическом показе Windows откроет сенсорную клавиатуру. В браузере необходим локальный мост клавиатуры. В переносимом EXE она запускается напрямую, без внешних программ. Убедитесь, что адрес открытого сайта разрешён в настройке NAVIKULTURA_KIOSK_ORIGIN; если Edge запросит «Доступ к локальной сети», разрешите его только для доверенного сайта. Браузер сам по себе не запускает приложения Windows.</p>
          <button type="button" @click="keyboardHelp=false">Закрыть</button>
        </div>
        <p v-else-if="keyboardMessage" class="kiosk-ticket-keyboard-result" role="status">{{ keyboardMessage }}</p>
      </div>
      <div v-else class="kiosk-ticket-invalid" role="alert">
        Ссылка на билет не относится к разрешённому сервису Muzaticket. Сообщите сотруднику ДК.
      </div>
      <footer class="kiosk-ticket-footer">
        <span>Продажу и оплату осуществляет Muzaticket. Банковские данные не обрабатываются НавиКультурой.</span>
        <span>Если экран оплаты не открывается внутри панели, потребуется настройка виджета у билетного оператора.</span>
      </footer>
    </section>
  </div>
</template>
