import { abilityFor, ANCESTRY_PASSIVES } from '../shared/abilities.js';

const selectedTargets = new Map();
const fallbackEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const effectLabels = {
  marked: ['◎', 'Markiert', 'Der nächste Treffer nutzt die Markierung.'],
  weakened: ['↘', 'Geschwächt', 'Der nächste Angriff verursacht weniger Schaden.'],
  protected: ['⬡', 'Geschützt', 'Der nächste Treffer wird abgeschwächt.'],
  thorns: ['❧', 'Dornen', 'Ein Angreifer erhält Gegenschaden.'],
};

function passiveFor(fighter) {
  const values = Array.isArray(ANCESTRY_PASSIVES) ? ANCESTRY_PASSIVES : Object.values(ANCESTRY_PASSIVES || {});
  return ANCESTRY_PASSIVES?.[fighter?.ancestry] || values.find(passive => passive.ancestry === fighter?.ancestry || passive.id === fighter?.ancestry) || null;
}

export function tacticalActionName(action) {
  return typeof action === 'string' && action.startsWith('ability:')
    ? abilityFor(action.slice(8))?.name || 'Fähigkeit'
    : { attack: 'Angriff', focus: 'Fokusstoß', guard: 'Deckung', rest: 'Verschnaufen', spring: 'Notquelle', runeSun: 'Sonnenrune', runeMoon: 'Mondrune' }[action] || 'Bereit';
}

export function renderTacticalStatus(fighter, e = fallbackEscape) {
  if (!fighter) return '';
  const effects = Object.entries(fighter.effects || {}).filter(([, value]) => value && (typeof value !== 'number' || value > 0));
  const passive = fighter.tacticsVersion ? passiveFor(fighter) : null;
  const energy = Math.max(0, Math.min(Number(fighter.maxEnergy) || 6, Number(fighter.energy) || 0));
  const maxEnergy = Math.max(1, Number(fighter.maxEnergy) || 6);
  return `${fighter.tacticsVersion && Number.isFinite(fighter.energy) ? `<div class="tactical-energy" aria-label="${energy} von ${maxEnergy} Ätherenergie"><div><span>✧ Ätherenergie</span><strong>${energy} / ${maxEnergy}</strong></div><div class="tactical-energy-track" aria-hidden="true"><span style="width:${energy / maxEnergy * 100}%"></span></div>${passive ? `<small title="${e(passive.description || '')}">${e(passive.name || 'Volksstärke')}<span>${e(passive.description || '')}</span></small>` : ''}</div>` : ''}${effects.length ? `<div class="tactical-effects" aria-label="Aktive Zustände">${effects.map(([key, effect]) => {
    const [glyph, name, description] = effectLabels[key] || ['✧', 'Äthereffekt', 'Eine Fähigkeit wirkt auf diesen Kämpfer.'];
    return `<span class="tactical-effect effect-${e(key)}" title="${e(description)}">${glyph} ${e(name)}${Number(effect?.turns || effect?.charges) > 1 ? ` · ${Number(effect.turns || effect.charges)}` : ''}</span>`;
  }).join('')}</div>` : ''}`;
}

/** Exact targets live on the action buttons. Changing the picker never submits a turn. */
export function renderAbilityActions({ fighter, allies = [], enemy = null, action, attributes = '', e = fallbackEscape, icon = () => '', disabled = false, context = '' }) {
  if (!fighter?.tacticsVersion) return '';
  const abilities = (fighter.abilityLoadout || []).map(abilityFor).filter(Boolean).slice(0, 3);
  const candidates = allies.filter(member => member.hp > 0);
  if (!candidates.some(member => member.id === fighter.id) && fighter.hp > 0) candidates.unshift(fighter);
  const contextId = context || `${action}:${fighter.id}`;
  const selectedId = selectedTargets.get(contextId);
  const selected = candidates.find(member => member.id === selectedId) || candidates.find(member => member.id === fighter.id) || candidates[0];
  const needsAllies = candidates.length > 1 && abilities.some(ability => ability.target === 'ally');
  return `<section class="tactical-abilities" aria-label="Deine drei Kampffähigkeiten"><div class="tactical-abilities-heading"><div><span class="eyebrow">DEINE DREI FÄHIGKEITEN</span><h3>Äther gezielt einsetzen</h3></div><span>Angriff und Deckung laden Energie auf.</span></div>${needsAllies ? `<div class="tactical-targets" role="group" aria-label="Ziel für Heilung und Schutz wählen"><span>Heilung & Schutz für:</span>${candidates.map(member => `<button type="button" data-action="combat-target" data-context="${e(contextId)}" data-target-id="${e(member.id)}" aria-pressed="${selected?.id === member.id}" class="${selected?.id === member.id ? 'selected' : ''}" ${disabled ? 'disabled' : ''}>${member.id === fighter.id ? 'Mich selbst' : e(member.characterName || member.name)}<small>${Math.max(0, member.hp)} / ${member.maxHp} LP</small></button>`).join('')}</div>` : ''}<div class="tactical-ability-grid">${abilities.map(ability => {
    const cost = Math.max(0, Number(ability.cost) || 0);
    const target = ability.target === 'self' || ability.target === 'party' ? fighter : ability.target === 'ally' ? selected || fighter : enemy;
    const insufficient = (Number(fighter.energy) || 0) < cost;
    const fullHealth = (ability.healFlat || ability.healFactor) && !ability.effect && ability.target !== 'party' && target?.hp >= target?.maxHp;
    const unusable = disabled || fighter.hp <= 0 || insufficient || !target || target.hp <= 0 || fullHealth;
    return `<button type="button" class="tactical-ability" data-action="${e(action)}" data-move="ability:${e(ability.id)}" data-target-id="${e(target?.id || '')}" ${attributes} ${unusable ? 'disabled' : ''}><span class="tactical-ability-top"><span class="tactical-ability-glyph" aria-hidden="true">${e(ability.glyph || '✧')}</span><span class="tactical-cost">${cost} ✧</span></span><strong>${e(ability.name)}</strong><span class="tactical-ability-description">${e(ability.description || '')}</span><small>${fullHealth ? 'Lebenspunkte sind bereits voll' : insufficient ? `Noch ${cost - (Number(fighter.energy) || 0)} Energie nötig` : ability.target === 'party' ? candidates.length > 1 ? 'Für deine ganze Gruppe' : 'Für dich selbst' : `${ability.target === 'ally' || ability.target === 'self' ? 'Für' : 'Gegen'} ${e(target?.characterName || target?.name || 'dein Ziel')}`}</small></button>`;
  }).join('')}</div></section>`;
}

export function handleTacticalTargetAction(button, { render } = {}) {
  if (button?.dataset?.action !== 'combat-target') return false;
  selectedTargets.set(button.dataset.context, button.dataset.targetId);
  render?.();
  return true;
}

export function resetTacticalUI() { selectedTargets.clear(); }

export function renderBossPhases(boss, e = fallbackEscape) {
  if (!boss?.phase) return '';
  const order = ['armor', 'onslaught', 'core'];
  const current = order.indexOf(boss.phase);
  const labels = { armor: 'Runenpanzer', onslaught: 'Steinsturm', core: 'Offener Kern' };
  const descriptions = {
    armor: 'Aktiviert Sonnen- und Mondrune mit zwei verschiedenen Helden. So öffnet ihr das Angriffsfenster.',
    onslaught: 'Der Golem greift heftiger an. Plant Schutz, Heilung und eure Angriffe gemeinsam.',
    core: 'Sein Kristallkern liegt offen. Bündelt eure Angriffe und achtet auf den angekündigten Gegenschlag.',
  };
  return `<section class="tactical-boss-phases" aria-label="Bossphase"><ol>${order.map((phase, index) => `<li class="${index === current ? 'current' : index < current ? 'cleared' : ''}" ${index === current ? 'aria-current="step"' : ''}><span>${index < current ? '✓' : index + 1}</span>${labels[phase]}</li>`).join('')}</ol><div><strong>${e(boss.phaseName || labels[boss.phase] || 'Neue Bossphase')}</strong><p>${e(boss.phaseDescription || descriptions[boss.phase] || '')}</p></div></section>`;
}
