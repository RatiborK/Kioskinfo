<!-- apps/web/src/components/KioskKeyboard.vue — optional on-screen keyboard for touch terminals. -->
<script setup lang="ts">
import {computed,ref} from 'vue';
const props=defineProps<{modelValue:string}>();
const emit=defineEmits<{'update:modelValue':[value:string];close:[]}>();
const layout=ref<'ru'|'en'>('ru');
const keys=computed(()=>layout.value==='ru'
  ? ['1234567890','йцукенгшщзхъ','фывапролджэ','ячсмитьбю','.,-@_']
  : ['1234567890','qwertyuiop','asdfghjkl','zxcvbnm','.,-@_']);
function append(letter:string){if(props.modelValue.length<80)emit('update:modelValue',props.modelValue+letter);}
function backspace(){emit('update:modelValue',Array.from(props.modelValue).slice(0,-1).join(''));}
</script>
<template>
  <section class="kiosk-keyboard" aria-label="Экранная клавиатура">
    <div v-for="(line,index) in keys" :key="index" class="kiosk-keyboard-row">
      <button v-for="letter in Array.from(line)" :key="letter" type="button" class="kiosk-key" :aria-label="'Ввести '+letter" @click="append(letter)">{{letter}}</button>
    </div>
    <div class="kiosk-keyboard-row kiosk-keyboard-tools">
      <button type="button" class="kiosk-key kiosk-key-action" @click="layout=layout==='ru'?'en':'ru'">{{layout==='ru'?'EN':'РУ'}}</button>
      <button type="button" class="kiosk-key kiosk-key-space" @click="append(' ')">Пробел</button>
      <button type="button" class="kiosk-key kiosk-key-action" aria-label="Удалить последнюю букву" @click="backspace">⌫</button>
      <button type="button" class="kiosk-key kiosk-key-action" @click="emit('update:modelValue','')">Очистить</button>
      <button type="button" class="kiosk-key kiosk-key-action" @click="emit('close')">Скрыть</button>
    </div>
  </section>
</template>
