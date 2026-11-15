import { moneyRangeForLevel, formatMoney } from '../shared/airships.js';

export function renderDailyChest({ state, e, icon, inInventory = false }) {
  const daily = state.dailyChest;
  if (!daily || state.user.role !== 'student') return '';
  const range = moneyRangeForLevel(state.user.level);
  return `<section class="daily-chest ${daily.available ? 'available' : 'claimed'}" aria-label="Tägliche Gratis-Truhe">
    <span class="daily-chest-art" aria-hidden="true">${icon('chest', '', 38)}<i>✧</i></span>
    <div class="daily-chest-copy"><span class="eyebrow">${daily.available ? 'DEIN TÄGLICHES GESCHENK' : 'HEUTE SCHON ABGEHOLT'}</span>
      <h2>Deine Gratis-Truhe</h2><p>Beim Öffnen: 1–2 zufällige Gegenstände und ${e(formatMoney(range.min))} bis ${e(formatMoney(range.max))} für deinen Geldbeutel.</p>
      <small>${daily.available ? 'Einmal pro Tag kostenlos. Geld erhältst du beim Öffnen im Inventar.' : 'Morgen wartet eine neue Gratis-Truhe auf dich.'} Neuer Tag ab 0 Uhr deutscher Zeit.</small></div>
    <div class="daily-chest-actions"><button class="button ${daily.available ? 'primary' : 'outline'}" data-action="daily-chest-claim" ${daily.available ? '' : 'disabled'}>${daily.available ? 'Gratis-Truhe abholen' : 'Heute abgeholt'} ${icon(daily.available ? 'gift' : 'check', '', 17)}</button>
      ${!inInventory && state.user.inventory.chests > 0 ? '<button class="text-button" data-action="nav" data-tab="inventory">Truhen im Inventar öffnen →</button>' : ''}</div>
  </section>`;
}
