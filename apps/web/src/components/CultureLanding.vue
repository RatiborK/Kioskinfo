<!-- apps/web/src/components/CultureLanding.vue — about DK, long-form safety and external tickets. -->
<script setup lang="ts">
import {computed,ref} from 'vue';
import type {CultureContent} from '../utils/culture-types.js';
const props=defineProps<{content:CultureContent;mode:'about'|'safety'|'tickets'|'contacts'}>();
const openSection=ref<string|null>(null);
const videoReady=computed(()=>Boolean(props.content.about.videoUrl));
const safeTicketUrl=computed(()=>props.content.tickets.url);
const iconPath:Record<string,string>={
  fire:'M12 3c2 4-3 5-1 9 1-1 4-3 4-6 4 5 4 7 1 10-1 3-4 5-7 5s-6-2-7-6c-1-4 0-7 4-11-1 4 0 6 2 8-1-5 3-8 5-11Z',
  exit:'M4 3h12v18H4z M8 12h12m-5-4 5 4-5 4',
  shield:'M12 2 4 6v6c0 6 4 9 8 10 4-1 8-4 8-10V6z',
  family:'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21v-7a6 6 0 0 1 12 0v7 M13 21v-7a5 5 0 0 1 10 0v7',
  heart:'M12 21S2 15 2 9a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 12-10 12Z',
  lock:'M5 10V7a7 7 0 0 1 14 0v3 M4 10h16v12H4z M12 14v4',
};
function safetyScroll(id:string){
  openSection.value=id;
  document.getElementById('safety-'+id)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
</script>
<template>
  <article v-if="mode==='safety'" class="culture-landing safety-landing" aria-label="Безопасность посетителей">
    <div class="safety-hero">
      <div class="safety-hero-copy">
        <span class="eyebrow">ПАМЯТКИ ДЛЯ ПОСЕТИТЕЛЕЙ · ДК «КИРОВСКИЙ»</span>
        <h2>{{content.safety.title}}</h2>
        <p>{{content.safety.intro}}</p>
        <div class="safety-hero-mark"><span>06</span> полезных памяток для каждого посетителя</div>
      </div>
      <div class="safety-hero-art" role="img" aria-label="Иллюстрация: защищённое пространство и забота о посетителях">
        <svg viewBox="0 0 340 310" fill="none" aria-hidden="true">
          <circle cx="170" cy="152" r="120" stroke="currentColor" stroke-opacity=".18" stroke-width="2"/>
          <circle cx="170" cy="152" r="88" stroke="currentColor" stroke-opacity=".16" stroke-width="2"/>
          <path d="M170 38 260 84v70c0 68-42 105-90 124-48-19-90-56-90-124V84Z"
            fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>
          <path d="m123 154 32 32 64-72" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="52" cy="99" r="9" fill="currentColor"/><circle cx="288" cy="231" r="7" fill="currentColor"/>
        </svg>
        <div class="safety-art-label">ВНИМАНИЕ · ЗАБОТА · БЕЗОПАСНОСТЬ</div>
      </div>
    </div>
    <nav class="safety-index" aria-label="Разделы безопасности">
      <button v-for="(section,index) in content.safety.sections" :key="section.id"
        type="button" @click="safetyScroll(section.id)">
        <span>{{String(index+1).padStart(2,'0')}}</span><strong>{{section.title}}</strong><i aria-hidden="true">↓</i>
      </button>
    </nav>
    <div class="safety-story">
      <section v-for="(section,index) in content.safety.sections" :id="'safety-'+section.id" :key="section.id"
        class="safety-story-section" :class="{reversed:index%2===1}">
        <div class="safety-story-art" :class="'safety-art-'+section.icon" role="img" :aria-label="'Иллюстрация: '+section.title">
          <span class="safety-art-index">{{String(index+1).padStart(2,'0')}} / ПАМЯТКА</span>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2"
            stroke-linecap="round" stroke-linejoin="round"><path :d="iconPath[section.icon]||iconPath.shield"/></svg>
          <span class="safety-art-bottom">{{section.title}}</span>
        </div>
        <div class="safety-story-copy">
          <span class="eyebrow">БЕЗОПАСНОСТЬ / {{String(index+1).padStart(2,'0')}}</span>
          <h3>{{section.title}}</h3>
          <p class="safety-story-subtitle">{{section.subtitle}}</p>
          <ol>
            <li v-for="(paragraph,p) in section.paragraphs" :key="p"><span>{{String(p+1).padStart(2,'0')}}</span><p>{{paragraph}}</p></li>
          </ol>
        </div>
      </section>
    </div>
    <footer class="safety-note">
      <div><strong>Важно знать</strong><p>{{content.safety.notice}}</p></div>
      <div class="safety-emergency"><small>ЕДИНЫЙ НОМЕР ЭКСТРЕННЫХ СЛУЖБ</small><strong>112</strong></div>
    </footer>
  </article>
  <article v-else-if="mode==='about'" class="culture-landing about-landing" aria-label="О дворце культуры">
    <div class="about-hero">
      <div class="about-hero-media">
        <img v-if="content.about.photo" :src="content.about.photo" alt="Здание Дворца культуры «Кировский»" loading="lazy"/>
        <div v-else class="culture-image-placeholder">ДК «Кировский» · Красноярск</div>
        <span v-if="content.about.photoCredit" class="culture-photo-credit">{{content.about.photoCredit}}</span>
      </div>
      <div class="about-hero-copy">
        <span class="eyebrow">НАША ИСТОРИЯ · С 1967 ГОДА</span>
        <h2>{{content.about.title}}</h2>
        <p>{{content.about.intro}}</p>
        <a v-if="videoReady" class="culture-video-link" :href="content.about.videoUrl" target="_blank" rel="noopener noreferrer">
          <span>▶</span> Видеопрогулка по Дворцу культуры
        </a>
      </div>
    </div>
    <div class="about-facts">
      <div v-for="(fact,index) in content.about.facts" :key="index">
        <span>{{String(index+1).padStart(2,'0')}}</span><p>{{fact}}</p>
      </div>
    </div>
    <section class="about-story-section"><span class="eyebrow">ИСТОРИЯ ДВОРЦА</span><h3>Культура объединяет</h3>
      <p v-for="(paragraph,index) in content.about.history" :key="index">{{paragraph}}</p>
    </section>
    <section class="about-video-banner">
      <span class="eyebrow">ПОЗНАКОМЬТЕСЬ С ДК БЛИЖЕ</span>
      <h3>Загляните за кулисы</h3>
      <p>Посмотрите видеопрогулку по зданию, сцене и творческому пространству Дворца культуры.</p>
      <a v-if="videoReady" :href="content.about.videoUrl" target="_blank" rel="noopener noreferrer">▶ Смотреть видео</a>
    </section>
    <p v-if="content.about.sourceUrl" class="culture-source">Историческая справка: <a :href="content.about.sourceUrl" target="_blank" rel="noopener noreferrer">Культура.РФ</a>. Часть сведений требует актуализации учреждением.</p>
  </article>
  <article v-else-if="mode==='tickets'" class="culture-landing tickets-landing" aria-label="Билеты на мероприятия">
    <div class="tickets-stage">
      <span class="eyebrow">НАВИКУЛЬТУРА / АФИША И БИЛЕТЫ</span>
      <div class="tickets-stage-art" aria-hidden="true"><span>✦</span><i></i><span>✦</span></div>
      <h2>{{content.tickets.title}}</h2>
      <p>{{content.tickets.intro}}</p>
      <a class="tickets-external-link" :href="safeTicketUrl" target="_blank" rel="noopener noreferrer">
        Посмотреть афишу и купить билет <span>↗</span>
      </a>
      <p class="tickets-stage-note">{{content.tickets.note}}</p>
    </div>
    <div class="tickets-benefits">
      <div><strong>01</strong><span>Выберите интересное событие</span></div>
      <div><strong>02</strong><span>Проверьте дату и свободные места</span></div>
      <div><strong>03</strong><span>Оформите заказ на сайте партнёра</span></div>
    </div>
  </article>
  <article v-else class="culture-landing culture-contacts" aria-label="Контакты ДК">
    <div class="culture-contacts-lead">
      <span class="eyebrow">МЫ РЯДОМ</span><h2>Контакты Дворца культуры</h2>
      <p>Приходите на спектакли, концерты и занятия. Сотрудники помогут выбрать нужное направление.</p>
    </div>
    <div class="culture-contact-grid">
      <div><small>АДРЕС</small><strong>{{content.contact.address}}</strong></div>
      <div><small>ТЕЛЕФОН</small><a :href="'tel:'+content.contact.phone.replace(/[^+\d]/g,'')">{{content.contact.phone}}</a></div>
      <div><small>О КРУЖКАХ И КОЛЛЕКТИВАХ</small><strong>{{content.contact.clubsPhone}}</strong></div>
      <div><small>СПРАВКИ О МЕРОПРИЯТИЯХ</small><strong>{{content.contact.eventsPhone}}</strong></div>
      <div><small>РЕЖИМ РАБОТЫ</small><strong>{{content.contact.hours}}</strong></div>
      <div><small>САЙТ</small><a :href="content.contact.website" target="_blank" rel="noopener noreferrer">Официальный сайт ↗</a></div>
    </div>
  </article>
</template>