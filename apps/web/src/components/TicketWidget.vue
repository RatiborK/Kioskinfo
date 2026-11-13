<!-- apps/web/src/components/TicketWidget.vue — trusted Muzaticket stays within kiosk overlay. -->
<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
const props=defineProps<{url:string}>();
const emit=defineEmits<{(e:'close'):void}>();
const DEFAULT='https://muzaticket.ru/iframe/organizations/organization-mau-gdk-kirovskii-448753';
function approved(value:string):string|null{
  try{
    const url=new URL(value||DEFAULT);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    if(!['muzaticket.ru','widget.muzaticket.ru'].includes(url.hostname.toLowerCase()))return null;
    return url.href;
  }catch{return null;}
}
const widgetUrl=computed(()=>approved(props.url));
const busy=ref(true),keyboardHelp=ref(false),ticketFrame=ref<HTMLIFrameElement|null>(null);
function showKeyboardHelp(){keyboardHelp.value=!keyboardHelp.value;ticketFrame.value?.focus();}
function esc(e:KeyboardEvent){if(e.key==='Escape'){e.stopPropagation();emit('close');}}
onMounted(()=>document.addEventListener('keydown',esc,true));
onBeforeUnmount(()=>document.removeEventListener('keydown',esc,true));
</script>
<template>
  <div class="kiosk-ticket-scrim" role="presentation">
    <section class="kiosk-ticket-modal" role="dialog" aria-modal="true" aria-label="Покупка билета Muzaticket">
      <header class="kiosk-ticket-header">
        <div><span>НАВИКУЛЬТУРА · БИЛЕТНАЯ КАССА</span>
          <h2>Билеты на мероприятие</h2></div>
        <div class="kiosk-ticket-header-actions">
          <button type="button" class="kiosk-ticket-keyboard" :aria-expanded="keyboardHelp" @click="showKeyboardHelp">
            ⌨ <span>Клавиатура</span>
          </button>
          <button type="button" class="kiosk-ticket-close" autofocus @click="emit('close')">✕ <span>Вернуться в НавиКультуру</span></button>
        </div>
      </header>
      <div v-if="widgetUrl" class="kiosk-ticket-content">
        <iframe ref="ticketFrame" :src="widgetUrl" title="Виджет покупки билетов Muzaticket" 
          sandbox="allow-scripts allow-forms allow-same-origin"
          allow="payment" referrerpolicy="no-referrer-when-downgrade"
          loading="eager" @load="busy=false"></iframe>
        <p v-if="busy" class="kiosk-ticket-wait" role="status">Загружается билетная система…</p>
        <div v-if="keyboardHelp" class="kiosk-ticket-keyboard-help" role="status">
          <strong>Сенсорная клавиатура Windows</strong>
          <p>Нажмите на поле внутри Muzaticket: клавиатура Windows появится, если включено автоматическое отображение при сенсорном вводе. Наша веб-клавиатура не может вводить текст в форму чужого сайта.</p>
          <button type="button" @click="keyboardHelp=false">Понятно</button>
        </div>
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