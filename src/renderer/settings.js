'use strict'
const B = window.settingsBridge
const $ = (id) => document.getElementById(id)
let S = null

function applyToUI() {
  $('wmin').value = S.wanderMinSeconds
  $('wminV').textContent = S.wanderMinSeconds + 's'
  $('wmax').value = S.wanderMaxSeconds
  $('wmaxV').textContent = S.wanderMaxSeconds + 's'
  $('wanderHint').textContent = `Wanders every ${S.wanderMinSeconds}–${S.wanderMaxSeconds}s before getting bored.`

  $('chaos').checked = S.chaos.enabled
  $('chaosGroup').classList.toggle('disabled', !S.chaos.enabled)
  document.querySelectorAll('[data-chaos]').forEach((el) => {
    el.checked = S.chaos[el.dataset.chaos]
    el.disabled = !S.chaos.enabled
  })

  $('count').value = S.duckCount
  $('countV').textContent = S.duckCount + (S.duckCount > 1 ? ' ducks' : ' duck')
  $('hunger').value = S.hungerMinutes
  $('hungerV').textContent = S.hungerMinutes + ' min'
  $('coop').checked = S.coop.enabled

  $('size').value = S.duckSize
  $('sizeV').textContent = S.duckSize + 'px'
  $('opacity').value = Math.round(S.opacity * 100)
  $('opacityV').textContent = Math.round(S.opacity * 100) + '%'

  $('sound').checked = S.soundEnabled
  $('vol').value = Math.round(S.honkVolume * 100)
  $('volV').textContent = Math.round(S.honkVolume * 100) + '%'
}

async function push(partial) {
  S = await B.set(partial)
  applyToUI()
}

function wire() {
  $('wmin').oninput = (e) => push({ wanderMinSeconds: +e.target.value })
  $('wmax').oninput = (e) => push({ wanderMaxSeconds: +e.target.value })
  $('chaos').onchange = (e) => push({ chaos: { enabled: e.target.checked } })
  document.querySelectorAll('[data-chaos]').forEach((el) => {
    el.onchange = () => push({ chaos: { [el.dataset.chaos]: el.checked } })
  })
  $('count').oninput = (e) => push({ duckCount: +e.target.value })
  $('hunger').oninput = (e) => push({ hungerMinutes: +e.target.value })
  $('coop').onchange = (e) => push({ coop: { enabled: e.target.checked } })
  $('feed').onclick = () => B.feed()
  $('size').oninput = (e) => push({ duckSize: +e.target.value })
  $('opacity').oninput = (e) => push({ opacity: +e.target.value / 100 })
  $('sound').onchange = (e) => push({ soundEnabled: e.target.checked })
  $('vol').oninput = (e) => push({ honkVolume: +e.target.value / 100 })
  $('memes').onclick = () => B.openMemes()
  $('notes').onclick = () => B.openNotes()
}

;(async () => {
  S = await B.get()
  wire()
  applyToUI()
  const ok = await B.accessibilityOk()
  if (!ok) {
    $('accHint').textContent =
      'Grab cursor / Nudge windows need Accessibility permission (System Settings → Privacy & Security → Accessibility).'
  }
})()
