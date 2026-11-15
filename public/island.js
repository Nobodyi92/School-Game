import { renderTacticalStatus, renderAbilityActions } from './combat-skills.js';
import { ISLAND_REWARDS } from '../lib/cosmetics.js';
import { islandSceneFor, renderArchipelago, renderIslandBackdrop } from './island-scenery.js';
const kinds = {
  puzzle: ['✧', 'Rätsel'], combat: ['⚔', 'Kampf'], event: ['➶', 'Begegnung'],
  camp: ['❧', 'Lagerplatz'], treasure: ['◇', 'Inselfund'], guardian: ['♜', 'Finale'],
};
const rewards = Object.entries(ISLAND_REWARDS);


function rewardCards(state, ids, e) {
  const catalogue = state.adventure?.cosmetics?.catalogue || [];
  return ids.map(id => {
    const item = catalogue.find(item => item.id === id);
    return `<span class="cosmetic-chip">${item?.type === 'companion' ? '✧' : item?.type === 'outfit' ? '♧' : '♜'} ${e(item?.name || 'Inselfund')}</span>`;
  }).join('');
}
function attrs(island, e) { return `data-run-id="${e(island.id)}" data-version="${island.state.version}"`; }
function hp(player, e) {
  return `<div class="adventure-health-card"><div><strong>${e(player.characterName || player.name)}</strong><span>${player.hp} / ${player.maxHp} LP</span></div><div class="health-track"><span style="width:${Math.max(0, Math.min(100, player.hp / player.maxHp * 100))}%"></span></div>${renderTacticalStatus(player, e)}</div>`;
}

function milestones(state, e) {
  return `<section class="adventure-panel island-milestones"><div class="section-title"><h2>Erinnerungen an deine Reise</h2><span class="pill neutral">REIN KOSMETISCH</span></div><div class="island-reward-grid">${rewards.map(([step, ids]) => `<div><strong>${Number(step) === 7 ? 'Insel abschließen' : `${step} Stationen & sichern`}</strong>${rewardCards(state, ids, e)}<small>${ids.every(id => state.user.cosmetics?.owned?.includes(id)) ? '✓ Bereits in deiner Sammlung' : 'Noch zu entdecken'}</small></div>`).join('')}</div></section>`;
}

export function renderIsland({ state, e, icon, heroAvatar }) {
  const island = state.adventure?.island, run = island?.state;
  if (!run) return `<section class="island-portal"><div><span class="eyebrow">DER WIND ZEIGT DIR NIE DENSELBEN WEG</span><h2>Von Insel zu Insel.<br>Dem Ätherlicht entgegen.</h2><p>Die wandelnde Insel ist von kleinen, schwebenden Inselstücken umgeben. Dein Reise-Luftschiff folgt dem Ätherstrom zu Wäldern, Ruinen und leuchtenden Rätseln. Wähle an sieben Stationen deinen Weg bis zum Gezeitenwächter.</p><button class="button gold" data-action="island-start">Zur Insel aufbrechen ${icon('arrow')}</button><div class="island-portal-facts"><span>◈ 7 Stationen</span><span>✧ Neue Reisefähigkeiten</span><span>☀ Ganz allein spielbar</span></div></div><div class="island-portal-compass"><span aria-hidden="true">✧</span><strong>Sieben Landungen.<br>Dein eigener Weg.</strong><p>Jenseits der Wolken wartet ein neuer Schauplatz. Deine Entscheidungen verbinden die Inseln zu deiner Reise.</p></div></section>${renderArchipelago(null, e, { preview: true })}${milestones(state, e)}`;
  const active = run.status === 'active', safe = ['route', 'boon'].includes(run.phase) && run.cleared > 0;
  const outfit = state.adventure?.islandBoons || [];
  const boonName = id => outfit.find(boon => boon.id === id)?.name || id;
  const both = run.enemy && ['combat', 'boon', 'finish'].includes(run.phase);
  const location = islandSceneFor(run);
  const scene = `<section class="island-location" aria-labelledby="island-location-title"><div class="island-location-heading"><div><span class="eyebrow">INSEL ${location.station} · ${e(kinds[location.encounterKind]?.[1] || 'ANLEGER')}</span><h3 id="island-location-title">${e(location.title)}</h3></div><span class="island-location-symbol" aria-hidden="true">${kinds[location.encounterKind]?.[0] || '✧'}</span></div><div class="adventure-arena island-scene" data-environment="island" data-island-station="${location.station}" data-island-feature="${e(location.feature || 'anleger')}" data-encounter-kind="${e(location.encounterKind)}" data-adventure-kind="island" data-adventure-id="${e(island.id)}" data-island-view="${both ? 'combat' : 'journey'}" role="img" aria-label="${e(`${location.title}: ${both ? 'dein Kampf' : 'dein Held'} auf einer schwebenden Insel zwischen weiteren Inselstücken im Ätherstrom`)}"><div class="hero3d-fallback arena3d-fallback island-scenic-fallback">${renderIslandBackdrop(location)}<div class="island-fallback-heroes">${heroAvatar(run.player)}${both ? `<span>VS</span>${heroAvatar(run.enemy)}` : ''}</div></div><p class="hero3d-status" role="status">Die schwebenden Inseln erscheinen im Ätherlicht …</p><span class="island-scene-label">${both ? e(run.enemy.name) : `Anleger ${location.station} von 7`}</span></div><p class="island-location-caption">${e(location.subtitle)}</p></section>`;
  let content = '';
  if (!active) {
    content = `<div class="adventure-result ${run.status === 'lost' ? 'lost' : 'won'}"><span class="island-result-symbol">${run.status === 'completed' ? '♜' : run.status === 'banked' ? '◈' : '≈'}</span><h2>${run.status === 'completed' ? 'Das Herz der Insel gehört dir.' : run.status === 'banked' ? 'Sicher zurück im Luftschiff.' : 'Der Nebel trägt dich nach Hause.'}</h2><p>${run.status === 'lost' ? 'Nur ungesicherte Funde dieser Reise sind verloren. Deine bisherigen Gegenstände, Tränke und XP bleiben erhalten.' : 'Deine freigeschalteten Inselbelohnungen warten dauerhaft in deiner Sammlung.'}</p><div class="pending-rewards">${run.status === 'lost' ? '' : rewardCards(state, run.pendingRewards, e)}</div><div class="raid-controls"><button class="button primary" data-action="island-start">Neue Inselreise ${icon('arrow')}</button><button class="button outline" data-action="nav" data-tab="collection">Sammlung ansehen</button></div></div>`;
  } else if (run.phase === 'route') {
    content = `<div class="island-choice-heading"><span class="eyebrow">STATION ${run.cleared + 1} VON 7</span><h3>${run.cleared === 6 ? 'Der letzte Weg führt zum Wächter.' : 'Welchen Weg nimmst du?'}</h3><p>Wähle, auf welcher kleinen Insel du als Nächstes landest. Dein Reise-Luftschiff folgt dem schwebenden Ätherstrom dorthin.</p></div><div class="island-route-grid">${run.choices.map(choice => `<button class="island-route-card kind-${choice.kind}" data-action="island-choice" data-choice="${e(choice.id)}" ${attrs(island, e)}><span class="island-route-icon">${kinds[choice.kind][0]}</span><small>${kinds[choice.kind][1]}</small><strong>${e(choice.title)}</strong><p>${e(choice.description)}</p><span class="island-route-link">Zu dieser Insel weiterreisen ${icon('arrow', '', 17)}</span></button>`).join('')}</div>`;
  } else if (run.phase === 'combat') {
    content = `<div class="enemy-intent">${icon('clock')}<div><strong>${e(run.enemy.intentLabel)}</strong><p>${run.enemy.intent === 'heavy' ? 'Jetzt kann Deckung den schweren Treffer abschwächen.' : 'Deine Reisefähigkeiten und deine Strategie zählen.'}</p></div></div><div class="adventure-actions island-combat-actions">${[
      ['attack', '⚔', 'Angreifen', run.boons.includes('echo') ? 'Jeder zweite Angriff löst Doppelblitz aus' : run.player.tacticsVersion ? '+2 Ätherenergie · direkter Schaden' : 'Direkter Schaden', false],
      ['focus', '✦', 'Fokusstoß', run.player.focusCooldown ? `Noch ${run.player.focusCooldown} eigene Züge` : 'Kräftiger Angriff mit Abklingzeit', run.player.focusCooldown > 0],
      ['guard', '◇', 'Deckung', run.boons.includes('mirror') ? 'Schützen, heilen und Schaden zurückwerfen' : run.player.tacticsVersion ? '+2 Ätherenergie · schützen und regenerieren' : 'Schützen und leicht regenerieren', false],
      ['spring', '♡', 'Notquelle', run.springUsed ? 'In diesem Kampf bereits genutzt' : 'Einmal pro Kampf bis zu 20 LP', run.springUsed || run.player.hp >= run.player.maxHp],
    ].filter(([move]) => !run.player.tacticsVersion || move !== 'focus').map(([move, glyph, name, hint, disabled]) => `<button class="adventure-move" data-action="island-action" data-move="${move}" ${attrs(island, e)} ${disabled ? 'disabled' : ''}><span>${glyph}</span><strong>${name}</strong><small>${hint}</small></button>`).join('')}</div>${renderAbilityActions({ fighter: run.player, enemy: run.enemy, action: 'island-action', attributes: attrs(island, e), context: `island:${island.id}`, e, icon })}`;
  } else if (run.phase === 'boon') {
    content = `<div class="island-choice-heading"><span class="eyebrow">EIN SEGEN FÜR DIESE REISE</span><h3>Mit welcher Fähigkeit ziehst du weiter?</h3><p>Diese Kräfte bleiben auf der Insel. Deine normalen Fähigkeiten und Gegenstände ändern sich nicht.</p></div><div class="island-options">${run.offers.map(boon => `<button class="island-option boon-option" data-action="island-choice" data-choice="${e(boon.id)}" ${attrs(island, e)}><span>${e(boon.glyph)}</span><strong>${e(boon.name)}</strong><small>${e(boon.description)}</small></button>`).join('')}</div>`;
  } else {
    content = `<section class="island-encounter kind-${e(run.phase)}"><span class="eyebrow">${kinds[run.phase]?.[0] || '✧'} ${kinds[run.phase]?.[1] || 'DEIN MOMENT'}</span><h3>${e(run.encounter.title)}</h3><p class="island-question">${e(run.encounter.text)}</p><div class="island-options">${run.encounter.options.map(option => `<button class="island-option" data-action="island-choice" data-choice="${e(option.id)}" ${attrs(island, e)} ${(option.cost || 0) > run.fragments ? 'disabled' : ''}><strong>${e(option.label)}</strong><small>${e(option.hint)}</small></button>`).join('')}</div><p class="island-encounter-note">${run.phase === 'puzzle' ? 'Eine falsche Antwort kostet 8 LP. Du darfst danach weiterreisen.' : run.phase === 'event' ? 'Sternsplitter sind Reisevorräte und verschwinden bei deiner Rückkehr.' : 'Dieser Halt kann nur einmal genutzt werden.'}</p></section>`;
  }
  return `<div class="island-run-bar"><div><span class="eyebrow">DEINE INSELEXPEDITION</span><h2>${run.cleared} / 7 Stationen geschafft</h2></div><span class="island-fragments" title="Nur auf dieser Reise nutzbar">✧ ${run.fragments} Sternsplitter</span></div>${renderArchipelago(run, e)}${scene}<div class="adventure-health-grid ${both ? '' : 'island-solo-health'}">${hp(run.player, e)}${both ? hp(run.enemy, e) : `<div class="island-current-boons"><strong>Deine Reisefähigkeiten</strong><span>${run.boons.length ? run.boons.map(id => e(boonName(id))).join(' · ') : 'Dein erster Windsegen wartet noch.'}</span></div>`}</div>${run.lastOutcome && active ? `<div class="island-outcome ${e(run.lastOutcome.tone)}" role="status"><strong>${e(run.lastOutcome.title)}</strong><p>${e(run.lastOutcome.text)}</p></div>` : ''}<section class="adventure-panel island-current">${content}${active && safe ? `<div class="island-bank"><div><strong>Was nimmst du mit nach Hause?</strong><div class="pending-rewards">${run.pendingRewards.length ? rewardCards(state, run.pendingRewards, e) : '<small>Ab Station 3 wartet dein erster Sammlungsfund.</small>'}</div></div><button class="button outline" data-action="island-bank" ${attrs(island, e)}>Funde sichern & zurückkehren ${icon('arrow', '', 17)}</button></div>` : ''}${active ? `<button class="text-button danger-link" data-action="island-abandon" ${attrs(island, e)}>Diese Reise aufgeben</button>` : ''}<div class="adventure-log"><h3>${icon('book', '', 17)} Dein Inseltagebuch</h3><ol>${run.log.slice(-6).map(line => `<li>${e(line)}</li>`).join('')}</ol></div></section>${milestones(state, e)}`;
}

export function mountIsland3D({ state, mountHero3D, mountArena3D, register }) {
  const island = state.adventure?.island;
  for (const horizon of document.querySelectorAll('[data-island-horizon]')) {
    const index = Number(horizon.dataset.islandJourneyCurrent) || 0;
    const canvas = horizon.querySelector('.island-archipelago-canvas');
    if (canvas && horizon.scrollWidth > horizon.clientWidth) horizon.scrollLeft = Math.max(0, (84 + index * 158) / 1120 * canvas.clientWidth - horizon.clientWidth / 2);
  }
  for (const host of document.querySelectorAll('.island-scene[data-adventure-id]')) {
    if (island?.id !== host.dataset.adventureId) continue;
    const environment = islandSceneFor(island.state);
    if (host.dataset.islandView === 'combat') register(host, () => mountArena3D(host, [island.state.player, island.state.enemy], { userId: state.user.id, environment }));
    else register(host, () => mountHero3D(host, island.state.player, { interactive: true, environment }));
  }
}

export async function handleIslandAction(button, { api, mutate, toast, confirmDialog }) {
  const action = button.dataset.action;
  if (!action.startsWith('island-')) return false;
  if (action === 'island-start') {
    await mutate(async () => { await api('/island/start', {}); toast('Das Luftschiff legt ab. Wähle deinen ersten Inselweg!'); }); return true;
  }
  const body = { runId: button.dataset.runId, version: Number(button.dataset.version) };
  if (action === 'island-choice') { await mutate(() => api('/island/choice', { ...body, choice: button.dataset.choice })); return true; }
  if (action === 'island-action') { await mutate(() => api('/island/action', { ...body, action: button.dataset.move, ...(button.dataset.targetId ? { targetId: button.dataset.targetId } : {}) })); return true; }
  if (action === 'island-bank' || action === 'island-abandon') {
    const bank = action === 'island-bank';
    if (await confirmDialog(bank ? 'Mit deinen Inselfunden zurückkehren?' : 'Diese Inselreise aufgeben?', bank ? 'Deine bisher entdeckten Sammlungsbelohnungen werden dauerhaft gesichert. Diese Reise endet hier.' : 'Nur ungesicherte Funde dieser Reise gehen verloren. Dein bisheriger Spielstand bleibt erhalten.', bank ? 'Funde sichern' : 'Reise aufgeben'))
      await mutate(() => api(bank ? '/island/bank' : '/island/abandon', body));
    return true;
  }
  return false;
}
